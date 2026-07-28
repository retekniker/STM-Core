const test = require("node:test");
const assert = require("node:assert/strict");
const RestartTracker = require("../src/restartTracker");

test("Steam ID rotation without confirmed offline state does not create a restart", () => {
    const tracker = new RestartTracker();

    tracker.process({
        state: {
            id: "EU1",
            timestamp: "2026-07-28T03:20:00.000Z"
        },
        queryResult: {
            success: true,
            steamId: "111"
        },
        reliabilityEvents: []
    });

    const result = tracker.process({
        state: {
            id: "EU1",
            timestamp: "2026-07-28T03:22:05.916Z"
        },
        queryResult: {
            success: true,
            steamId: "222"
        },
        reliabilityEvents: [
            {
                type: "SERVER_RECOVERED",
                message: "Server query recovered"
            }
        ]
    });

    assert.equal(
        result.events.some(event => event.type === "SERVER_RESTART"),
        false
    );

    assert.equal(result.state.lastRestartAt, null);
});

test("Confirmed offline-to-online cycle creates exactly one restart", () => {
    const tracker = new RestartTracker();

    tracker.process({
        state: {
            id: "EU1",
            timestamp: "2026-07-28T04:00:00.000Z"
        },
        queryResult: {
            success: false
        },
        reliabilityEvents: [
            {
                type: "SERVER_OFFLINE",
                message: "Server marked offline"
            }
        ]
    });

    const result = tracker.process({
        state: {
            id: "EU1",
            timestamp: "2026-07-28T04:01:00.000Z"
        },
        queryResult: {
            success: true,
            steamId: "333"
        },
        reliabilityEvents: [
            {
                type: "SERVER_ONLINE",
                message: "Server is responding again"
            }
        ]
    });

    const restarts = result.events.filter(
        event => event.type === "SERVER_RESTART"
    );

    assert.equal(restarts.length, 1);
    assert.equal(restarts[0].reason, "OFFLINE_ONLINE_CYCLE");
    assert.equal(
        restarts[0].restartAt,
        "2026-07-28T04:00:00.000Z"
    );
});
