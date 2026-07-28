const RANGE_MS = Object.freeze({
    "30m": 30 * 60 * 1000,
    "2h": 2 * 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000
});

class TelemetryHistory {

    constructor(options = {}) {
        this.maximumPoints = options.maximumPoints ?? 360;
    }

    getRangeMs(range) {
        return RANGE_MS[range] || null;
    }

    getBucketMs(rangeMs) {
        return Math.max(
            1000,
            Math.ceil(rangeMs / this.maximumPoints)
        );
    }

    downsample(snapshots, startMs, endMs) {
        const rangeMs = Math.max(1, endMs - startMs);
        const bucketMs = this.getBucketMs(rangeMs);
        const buckets = new Map();

        for (const snapshot of snapshots) {
            const timestamp = Date.parse(snapshot.timestamp);

            if (
                !Number.isFinite(timestamp) ||
                timestamp < startMs ||
                timestamp > endMs
            ) {
                continue;
            }

            const bucketIndex = Math.min(
                this.maximumPoints - 1,
                Math.floor((timestamp - startMs) / bucketMs)
            );
            const bucket = buckets.get(bucketIndex) || {
                timestamp,
                samples: 0,
                successes: 0,
                pingTotal: 0,
                pingSamples: 0,
                playersTotal: 0,
                playerSamples: 0,
                maxPlayers: null
            };

            bucket.timestamp = Math.max(
                bucket.timestamp,
                timestamp
            );
            bucket.samples += 1;

            if (snapshot.success) {
                bucket.successes += 1;
            }

            const ping = Number(snapshot.ping);
            if (snapshot.success && Number.isFinite(ping)) {
                bucket.pingTotal += ping;
                bucket.pingSamples += 1;
            }

            const players = Number(snapshot.players);
            if (snapshot.success && Number.isFinite(players)) {
                bucket.playersTotal += players;
                bucket.playerSamples += 1;
            }

            const maxPlayers = Number(snapshot.maxPlayers);
            if (Number.isFinite(maxPlayers)) {
                bucket.maxPlayers = maxPlayers;
            }

            buckets.set(bucketIndex, bucket);
        }

        return Array.from(buckets.entries())
            .sort(([left], [right]) => left - right)
            .map(([, bucket]) => {
                const successRate =
                    bucket.successes / bucket.samples;
                const status = successRate === 1
                    ? "ONLINE"
                    : successRate === 0
                        ? "OFFLINE"
                        : "DEGRADED";

                return {
                    timestamp:
                        new Date(bucket.timestamp).toISOString(),
                    ping: bucket.pingSamples > 0
                        ? Math.round(
                            bucket.pingTotal /
                            bucket.pingSamples
                        )
                        : null,
                    players: bucket.playerSamples > 0
                        ? Number((
                            bucket.playersTotal /
                            bucket.playerSamples
                        ).toFixed(1))
                        : null,
                    maxPlayers: bucket.maxPlayers,
                    status,
                    successRate: Number(
                        successRate.toFixed(3)
                    ),
                    samples: bucket.samples
                };
            });
    }

    getRestartMarker(event) {
        const data = event?.data || {};
        const classification = data.classification || null;
        const previousSteamId = data.previousSteamId;
        const currentSteamId = data.currentSteamId;
        const legacyInstanceChange =
            !classification &&
            (
                data.reason === "STEAM_ID_ROTATION" ||
                (
                    previousSteamId !== null &&
                    previousSteamId !== undefined &&
                    currentSteamId !== null &&
                    currentSteamId !== undefined &&
                    String(previousSteamId) !==
                        String(currentSteamId)
                )
            );

        if (
            classification !== "PROCESS_RESTART" &&
            classification !==
                "PROCESS_RESTART_IN_OBSERVATION_GAP" &&
            !legacyInstanceChange
        ) {
            return null;
        }

        const timestamp =
            data.restartAt ||
            data.observationWindow?.end ||
            event.timestamp;

        if (!Number.isFinite(Date.parse(timestamp))) {
            return null;
        }

        return {
            timestamp,
            classification:
                classification || "PROCESS_RESTART",
            confidence:
                data.confidence || "LEGACY_VERIFIED",
            timeKnown: data.timeKnown !== false,
            reason: data.reason || null,
            previousSteamId:
                previousSteamId ?? null,
            currentSteamId:
                currentSteamId ?? null,
            evidence: data.evidence || null,
            observationWindow:
                data.observationWindow || null
        };
    }

    buildSeries({
        serverIds,
        snapshots,
        events,
        states,
        startMs,
        endMs
    }) {
        return serverIds.map(serverId => {
            const serverSnapshots = snapshots.filter(
                snapshot => snapshot.serverId === serverId
            );
            const restarts = events
                .filter(event => event.serverId === serverId)
                .map(event => this.getRestartMarker(event))
                .filter(Boolean)
                .filter(marker => {
                    const timestamp = Date.parse(marker.timestamp);
                    return timestamp >= startMs && timestamp <= endMs;
                });
            const state = states.find(
                item => item.id === serverId
            );

            return {
                serverId,
                points: this.downsample(
                    serverSnapshots,
                    startMs,
                    endMs
                ),
                restarts,
                prediction:
                    state?.restartPrediction || null
            };
        });
    }
}

TelemetryHistory.RANGE_MS = RANGE_MS;

module.exports = TelemetryHistory;
