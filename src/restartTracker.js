const RestartEvidenceScorer =
    require("./restartEvidenceScorer");

class RestartTracker {

    constructor(options = {}) {
        this.servers = new Map();

        this.observationGapMs =
            options.observationGapMs ?? 300000;

        this.sessionResetMaxSeconds =
            options.sessionResetMaxSeconds ?? 120;

        this.sessionResetMinimumDropSeconds =
            options.sessionResetMinimumDropSeconds ?? 30;

        this.evidenceScorer =
            options.evidenceScorer ||
            new RestartEvidenceScorer();
    }

    hydrate(
        serverId,
        restartEvent = null,
        snapshot = null,
        offlineSince = null
    ) {
        const data = restartEvent?.data || {};
        const restartTimeUnknown =
            data.timeKnown === false ||
            data.classification ===
                "PROCESS_RESTART_IN_OBSERVATION_GAP";

        const snapshotSucceeded =
            snapshot?.success === true ||
            snapshot?.success === 1;

        this.servers.set(serverId, {
            previousSteamId:
                snapshot?.steamId !== null &&
                snapshot?.steamId !== undefined
                    ? String(snapshot.steamId)
                    : null,

            lastSuccessfulAt:
                snapshotSucceeded
                    ? snapshot?.timestamp || null
                    : null,

            lastPlayers:
                snapshotSucceeded &&
                Number.isFinite(Number(snapshot?.players))
                    ? Number(snapshot.players)
                    : null,

            lastPlayerTimes: new Map(),

            interruption:
                offlineSince
                    ? {
                        firstFailureAt: offlineSince,
                        failedQueries: 1
                    }
                    : null,

            offlineSince:
                offlineSince || null,

            candidate: null,

            lastRestartAt:
                restartTimeUnknown
                    ? null
                    : data.restartAt ||
                        restartEvent?.timestamp ||
                        null,

            lastRestartDetectedAt:
                data.detectedAt ||
                restartEvent?.timestamp ||
                null,

            lastRestartReason:
                data.reason ||
                null
        });
    }

    isVerifiedRestartEvent(event) {
        const data = event?.data || event || {};

        if (
            data.classification === "PROCESS_RESTART" ||
            data.classification ===
                "PROCESS_RESTART_IN_OBSERVATION_GAP"
        ) {
            return true;
        }

        if (data.reason === "STEAM_ID_ROTATION") {
            return true;
        }

        const previousSteamId = data.previousSteamId;
        const currentSteamId = data.currentSteamId;

        return (
            previousSteamId !== null &&
            previousSteamId !== undefined &&
            currentSteamId !== null &&
            currentSteamId !== undefined &&
            String(previousSteamId) !==
                String(currentSteamId)
        );
    }

    getRecord(serverId) {
        if (!this.servers.has(serverId)) {
            this.hydrate(serverId);
        }

        return this.servers.get(serverId);
    }

    getSteamId(queryResult) {
        if (
            queryResult?.steamId === null ||
            queryResult?.steamId === undefined
        ) {
            return null;
        }

        return String(queryResult.steamId);
    }

    getPlayers(queryResult, state) {
        const value =
            queryResult?.players ??
            state?.players;

        return Number.isFinite(Number(value))
            ? Number(value)
            : null;
    }

    getPlayerTimes(queryResult) {
        const result = new Map();

        if (!Array.isArray(queryResult?.playerList)) {
            return result;
        }

        for (const player of queryResult.playerList) {
            const name =
                typeof player?.name === "string"
                    ? player.name.trim()
                    : "";

            const time = Number(player?.time);

            if (!name || !Number.isFinite(time)) {
                continue;
            }

            result.set(name, time);
        }

        return result;
    }

    mergeMinimumPlayerTimes(target, source) {
        for (const [name, time] of source.entries()) {
            const previous = target.get(name);

            if (
                previous === undefined ||
                time < previous
            ) {
                target.set(name, time);
            }
        }
    }

    calculateGapMs(start, end) {
        const startMs = Date.parse(start);
        const endMs = Date.parse(end);

        if (
            !Number.isFinite(startMs) ||
            !Number.isFinite(endMs)
        ) {
            return null;
        }

        return Math.max(0, endMs - startMs);
    }

    startCandidate({
        record,
        steamId,
        timestamp,
        players,
        playerTimes
    }) {
        const previousSuccessfulAt =
            record.lastSuccessfulAt;

        const gapMs = this.calculateGapMs(
            previousSuccessfulAt,
            timestamp
        );

        const observationGap =
            !record.interruption &&
            Number.isFinite(gapMs) &&
            gapMs > this.observationGapMs;

        record.candidate = {
            steamId,
            previousSteamId:
                record.previousSteamId,

            firstSeenAt: timestamp,
            transitionStartAt: timestamp,
            stableSteamIdAt: timestamp,

            consecutiveReadings: 1,
            rejectedSteamIds: [],

            previousSuccessfulAt,
            observationGap,
            observationGapMs: gapMs,

            recoveredAt:
                record.interruption
                    ? timestamp
                    : null,

            offlineSince:
                record.offlineSince,

            failedQueries:
                record.interruption?.failedQueries || 0,

            firstFailureAt:
                record.interruption?.firstFailureAt || null,

            beforePlayers:
                record.lastPlayers,

            afterPlayers:
                players,

            baselinePlayerTimes:
                new Map(record.lastPlayerTimes),

            postRestartPlayerTimes:
                new Map(playerTimes)
        };
    }

    replaceCandidate({
        record,
        steamId,
        timestamp,
        players,
        playerTimes
    }) {
        const candidate = record.candidate;

        candidate.rejectedSteamIds.push(
            candidate.steamId
        );

        candidate.steamId = steamId;
        candidate.firstSeenAt = timestamp;
        candidate.stableSteamIdAt = timestamp;
        candidate.consecutiveReadings = 1;
        candidate.afterPlayers = players;
        candidate.postRestartPlayerTimes =
            new Map(playerTimes);
    }

    getPlayerSessionResetEvidence(candidate) {
        const players = [];
        const details = [];

        for (
            const [name, previousTime]
            of candidate.baselinePlayerTimes.entries()
        ) {
            const currentTime =
                candidate.postRestartPlayerTimes.get(name);

            if (!Number.isFinite(currentTime)) {
                continue;
            }

            const droppedBy =
                previousTime - currentTime;

            const reset =
                previousTime >
                    this.sessionResetMaxSeconds &&
                currentTime <=
                    this.sessionResetMaxSeconds &&
                droppedBy >=
                    this.sessionResetMinimumDropSeconds;

            if (!reset) {
                continue;
            }

            players.push(name);

            details.push({
                player: name,
                beforeSeconds: previousTime,
                afterSeconds: currentTime,
                droppedBySeconds: droppedBy
            });
        }

        return {
            present: players.length > 0,
            players,
            details
        };
    }

    getRosterResetEvidence(candidate) {
        const before =
            candidate.beforePlayers;

        const after =
            candidate.afterPlayers;

        const present =
            Number.isFinite(before) &&
            Number.isFinite(after) &&
            before > 0 &&
            (
                after === 0 ||
                (
                    before >= 5 &&
                    after <= Math.floor(before * 0.2)
                )
            );

        return {
            present,
            before,
            after,
            droppedBy:
                Number.isFinite(before) &&
                Number.isFinite(after)
                    ? before - after
                    : null
        };
    }

    getPlayerSessionContinuityEvidence(candidate) {
        const players = [];
        const details = [];

        for (
            const [name, previousTime]
            of candidate.baselinePlayerTimes.entries()
        ) {
            const currentTime =
                candidate.postRestartPlayerTimes.get(name);

            if (
                !Number.isFinite(currentTime) ||
                currentTime < previousTime
            ) {
                continue;
            }

            players.push(name);
            details.push({
                player: name,
                beforeSeconds: previousTime,
                afterSeconds: currentTime,
                increasedBySeconds:
                    currentTime - previousTime
            });
        }

        return {
            present: players.length > 0,
            players,
            details
        };
    }

    confirmCandidate(record, timestamp) {
        const candidate =
            record.candidate;

        const classification =
            candidate.observationGap
                ? "PROCESS_RESTART_IN_OBSERVATION_GAP"
                : "PROCESS_RESTART";

        const timeKnown =
            !candidate.observationGap;

        const restartAt =
            timeKnown
                ? candidate.transitionStartAt
                : null;

        const playerSessionReset =
            this.getPlayerSessionResetEvidence(
                candidate
            );

        const rosterReset =
            this.getRosterResetEvidence(
                candidate
            );

        const playerSessionContinuity =
            this.getPlayerSessionContinuityEvidence(
                candidate
            );

        const event = {
            type: "SERVER_RESTART",

            message:
                classification ===
                "PROCESS_RESTART_IN_OBSERVATION_GAP"
                    ? "Server process changed during an observation gap"
                    : "Server process restart confirmed by stable Steam ID rotation",

            classification,
            confidence: "CONFIRMED",
            reason: "STEAM_ID_ROTATION",

            timeKnown,
            restartAt,
            detectedAt: timestamp,

            recoveredAt:
                candidate.recoveredAt,

            stableSteamIdAt:
                candidate.stableSteamIdAt,

            previousSteamId:
                candidate.previousSteamId,

            currentSteamId:
                candidate.steamId,

            rejectedSteamIds:
                [...candidate.rejectedSteamIds],

            observationWindow:
                candidate.observationGap
                    ? {
                        start:
                            candidate.previousSuccessfulAt,
                        end:
                            candidate.transitionStartAt
                    }
                    : null,

            evidence: {
                steamIdRotation: {
                    present: true,
                    previousSteamId:
                        candidate.previousSteamId,
                    currentSteamId:
                        candidate.steamId,
                    consecutiveReadings:
                        candidate.consecutiveReadings
                },

                queryInterruption: {
                    present:
                        candidate.failedQueries > 0,
                    failedQueries:
                        candidate.failedQueries,
                    firstFailureAt:
                        candidate.firstFailureAt
                },

                offlineState: {
                    present:
                        Boolean(candidate.offlineSince),
                    offlineSince:
                        candidate.offlineSince
                },

                rosterReset,

                playerSessionReset,

                playerSessionContinuity,

                observationGap: {
                    present:
                        candidate.observationGap,
                    durationMs:
                        candidate.observationGapMs,
                    start:
                        candidate.previousSuccessfulAt,
                    end:
                        candidate.transitionStartAt
                }
            }
        };

        event.evidenceScore =
            this.evidenceScorer.score({
                evidence: event.evidence
            });

        if (restartAt) {
            record.lastRestartAt =
                restartAt;
        }

        record.lastRestartDetectedAt =
            timestamp;

        record.lastRestartReason =
            event.reason;

        return event;
    }

    updateStableSample(
        record,
        timestamp,
        steamId,
        players,
        playerTimes
    ) {
        if (steamId) {
            record.previousSteamId =
                steamId;
        }

        record.lastSuccessfulAt =
            timestamp;

        record.lastPlayers =
            players;

        record.lastPlayerTimes =
            new Map(playerTimes);
    }

    clearInterruption(record) {
        record.interruption = null;
        record.offlineSince = null;
    }

    applyState(
        state,
        record,
        querySucceeded,
        detectionStatus = null
    ) {
        const restartTimestamp =
            record.lastRestartAt
                ? Date.parse(record.lastRestartAt)
                : null;

        state.lastRestartAt =
            record.lastRestartAt;

        state.lastRestartDetectedAt =
            record.lastRestartDetectedAt;

        state.lastRestartReason =
            record.lastRestartReason;

        state.restartDetectionStatus =
            detectionStatus ||
            (
                record.candidate
                    ? "VERIFYING"
                    : querySucceeded
                        ? "ONLINE"
                        : state.status || "OFFLINE"
            );

        state.restartCandidateSteamId =
            record.candidate?.steamId || null;

        state.restartCandidateSince =
            record.candidate?.transitionStartAt ||
            null;

        state.uptimeSinceRestartSeconds =
            Number.isFinite(restartTimestamp)
                ? Math.max(
                    0,
                    Math.floor(
                        (
                            Date.now() -
                            restartTimestamp
                        ) / 1000
                    )
                )
                : null;
    }

    process({
        state,
        queryResult,
        reliabilityEvents = []
    }) {
        if (!state || !state.id) {
            throw new Error(
                "Restart tracker requires server state"
            );
        }

        const record =
            this.getRecord(state.id);

        const events = [];

        const timestamp =
            state.timestamp ||
            new Date().toISOString();

        const becameOffline =
            reliabilityEvents.some(
                event =>
                    event.type ===
                    "SERVER_OFFLINE"
            );

        if (!queryResult?.success) {
            if (!record.interruption) {
                record.interruption = {
                    firstFailureAt: timestamp,
                    failedQueries: 1
                };
            } else {
                record.interruption.failedQueries += 1;
            }

            if (
                becameOffline &&
                !record.offlineSince
            ) {
                record.offlineSince =
                    timestamp;
            }

            this.applyState(
                state,
                record,
                false
            );

            return {
                state,
                events
            };
        }

        const currentSteamId =
            this.getSteamId(queryResult);

        const players =
            this.getPlayers(
                queryResult,
                state
            );

        const playerTimes =
            this.getPlayerTimes(
                queryResult
            );

        let detectionStatus = null;

        if (!record.previousSteamId) {
            record.candidate = null;

            this.updateStableSample(
                record,
                timestamp,
                currentSteamId,
                players,
                playerTimes
            );

            this.clearInterruption(record);
        } else if (record.candidate) {
            const candidate =
                record.candidate;

            if (
                currentSteamId ===
                candidate.steamId
            ) {
                candidate.consecutiveReadings += 1;

                this.mergeMinimumPlayerTimes(
                    candidate.postRestartPlayerTimes,
                    playerTimes
                );

                if (
                    candidate.consecutiveReadings >= 2
                ) {
                    const event =
                        this.confirmCandidate(
                            record,
                            timestamp
                        );

                    events.push(event);

                    this.updateStableSample(
                        record,
                        timestamp,
                        currentSteamId,
                        players,
                        playerTimes
                    );

                    record.candidate = null;
                    this.clearInterruption(record);

                    detectionStatus =
                        "RESTART_CONFIRMED";
                }
            } else if (
                currentSteamId ===
                record.previousSteamId
            ) {
                record.candidate = null;

                this.updateStableSample(
                    record,
                    timestamp,
                    currentSteamId,
                    players,
                    playerTimes
                );

                this.clearInterruption(record);

                detectionStatus =
                    "ONLINE";
            } else if (currentSteamId) {
                this.replaceCandidate({
                    record,
                    steamId:
                        currentSteamId,
                    timestamp,
                    players,
                    playerTimes
                });

                detectionStatus =
                    "VERIFYING";
            }
        } else if (
            currentSteamId &&
            currentSteamId !==
                record.previousSteamId
        ) {
            this.startCandidate({
                record,
                steamId:
                    currentSteamId,
                timestamp,
                players,
                playerTimes
            });

            detectionStatus =
                "VERIFYING";
        } else {
            this.updateStableSample(
                record,
                timestamp,
                currentSteamId,
                players,
                playerTimes
            );

            this.clearInterruption(record);

            detectionStatus =
                "ONLINE";
        }

        this.applyState(
            state,
            record,
            true,
            detectionStatus
        );

        return {
            state,
            events
        };
    }

}

module.exports = RestartTracker;
