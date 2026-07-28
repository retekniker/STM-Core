class RestartTracker {

    constructor() {
        this.servers = new Map();
    }

    hydrate(serverId, restartEvent = null, snapshot = null, offlineSince = null) {

        const data = restartEvent?.data || {};

        this.servers.set(serverId, {
            previousSteamId: snapshot?.steamId ? String(snapshot.steamId) : null,
            offlineSince: offlineSince || null,
            lastRestartAt:
                data.restartAt ||
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

    getRecord(serverId) {

        if (!this.servers.has(serverId)) {
            this.hydrate(serverId);
        }

        return this.servers.get(serverId);
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

        const record = this.getRecord(state.id);
        const events = [];

        const timestamp =
            state.timestamp ||
            new Date().toISOString();

        const becameOffline =
            reliabilityEvents.some(
                event =>
                    event.type === "SERVER_OFFLINE"
            );

        if (becameOffline) {
            record.offlineSince = timestamp;
        }

        if (queryResult?.success) {

            const currentSteamId =
                queryResult.steamId !== null &&
                queryResult.steamId !== undefined
                    ? String(queryResult.steamId)
                    : null;

            let reason = null;
            let restartAt = null;

            if (record.offlineSince) {
                reason = "OFFLINE_ONLINE_CYCLE";
                restartAt = record.offlineSince;
            }

            if (reason) {

                const event = {
                    type: "SERVER_RESTART",
                    message:
                        reason === "STEAM_ID_ROTATION"
                            ? "Server restart confirmed by Steam ID rotation"
                            : "Server restart confirmed by offline-online cycle",
                    reason,
                    restartAt,
                    detectedAt: timestamp,
                    offlineSince:
                        record.offlineSince,
                    previousSteamId:
                        record.previousSteamId,
                    currentSteamId
                };

                record.lastRestartAt =
                    restartAt;

                record.lastRestartDetectedAt =
                    timestamp;

                record.lastRestartReason =
                    reason;

                events.push(event);
            }

            if (currentSteamId) {
                record.previousSteamId =
                    currentSteamId;
            }

            if (queryResult.success) {
                record.offlineSince = null;
            }
        }

        const restartTimestamp =
            record.lastRestartAt
                ? Date.parse(
                    record.lastRestartAt
                )
                : null;

        state.lastRestartAt =
            record.lastRestartAt;

        state.lastRestartDetectedAt =
            record.lastRestartDetectedAt;

        state.lastRestartReason =
            record.lastRestartReason;

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

        return {
            state,
            events
        };
    }

}

module.exports = RestartTracker;
