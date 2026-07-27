class ReliabilityEngine {

    constructor(failureThreshold = 3) {

        if (
            !Number.isInteger(failureThreshold) ||
            failureThreshold < 1
        ) {
            throw new Error(
                "Failure threshold must be a positive integer"
            );
        }

        this.failureThreshold = failureThreshold;
        this.servers = new Map();
    }

    process(queryResult) {

        if (!queryResult || !queryResult.id) {
            throw new Error(
                "Query result must contain a server id"
            );
        }

        const previous = this.servers.get(
            queryResult.id
        ) || {
            status: "UNKNOWN",
            consecutiveFailures: 0,
            lastGoodState: null
        };

        if (queryResult.success) {
            return this.processSuccess(
                queryResult,
                previous
            );
        }

        return this.processFailure(
            queryResult,
            previous
        );
    }

    processSuccess(queryResult, previous) {

        const events = [];

        if (previous.status === "OFFLINE") {
            events.push({
                type: "SERVER_ONLINE",
                message: "Server is responding again"
            });
        } else if (previous.status === "DEGRADED") {
            events.push({
                type: "SERVER_RECOVERED",
                message: "Server query recovered"
            });
        }

        const state = {
            ...structuredClone(queryResult),

            status: "ONLINE",
            querySuccess: true,
            stale: false,

            consecutiveFailures: 0,
            lastSuccessAt: queryResult.timestamp,
            lastError: null
        };

        this.servers.set(queryResult.id, {
            status: "ONLINE",
            consecutiveFailures: 0,
            lastGoodState: structuredClone(state)
        });

        return {
            state,
            events
        };
    }

    processFailure(queryResult, previous) {

        const consecutiveFailures =
            previous.consecutiveFailures + 1;

        const isOffline =
            consecutiveFailures >=
            this.failureThreshold;

        const status = isOffline
            ? "OFFLINE"
            : "DEGRADED";

        const events = [];

        if (
            status === "DEGRADED" &&
            previous.status !== "DEGRADED"
        ) {
            events.push({
                type: "SERVER_DEGRADED",
                message:
                    `Query failed ${consecutiveFailures} time(s)`
            });
        }

        if (
            status === "OFFLINE" &&
            previous.status !== "OFFLINE"
        ) {
            events.push({
                type: "SERVER_OFFLINE",
                message:
                    `Server marked offline after ` +
                    `${consecutiveFailures} failed queries`
            });
        }

        const baseState =
            previous.lastGoodState
                ? structuredClone(
                    previous.lastGoodState
                )
                : {
                    id: queryResult.id,
                    playerList: []
                };

        const state = {
            ...baseState,

            success: false,
            timestamp: queryResult.timestamp,
            id: queryResult.id,

            status,
            querySuccess: false,
            stale: true,

            consecutiveFailures,
            lastSuccessAt:
                previous.lastGoodState?.lastSuccessAt ||
                null,

            lastError: queryResult.error,
            error: queryResult.error
        };

        this.servers.set(queryResult.id, {
            status,
            consecutiveFailures,
            lastGoodState:
                previous.lastGoodState
                    ? structuredClone(
                        previous.lastGoodState
                    )
                    : null
        });

        return {
            state,
            events
        };
    }

    get(serverId) {

        const record = this.servers.get(serverId);

        return record
            ? structuredClone(record)
            : null;
    }

}

module.exports = ReliabilityEngine;
