const test = require("node:test");
const assert = require("node:assert/strict");
const RestartTracker = require("../src/restartTracker");

function processSample(tracker, {
    serverId = "EU1",
    timestamp,
    success = true,
    steamId = null,
    players = 0,
    playerList = [],
    reliabilityEvents = []
}) {
    return tracker.process({
        state: {
            id: serverId,
            timestamp,
            players
        },
        queryResult: {
            success,
            steamId,
            players,
            playerList
        },
        reliabilityEvents
    });
}

test("first changed Steam ID creates a candidate but not a restart", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-28T03:20:00.000Z",
        steamId: "111",
        players: 11
    });

    const result = processSample(tracker, {
        timestamp: "2026-07-28T03:22:05.000Z",
        steamId: "222",
        players: 0
    });

    assert.equal(result.events.length, 0);
    assert.equal(result.state.restartDetectionStatus, "VERIFYING");
    assert.equal(result.state.restartCandidateSteamId, "222");
    assert.equal(result.state.lastRestartAt, null);
});

test("second consecutive reading of changed Steam ID confirms a process restart", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-28T03:20:00.000Z",
        steamId: "111",
        players: 11
    });

    processSample(tracker, {
        timestamp: "2026-07-28T03:22:05.000Z",
        steamId: "222",
        players: 0
    });

    const result = processSample(tracker, {
        timestamp: "2026-07-28T03:22:10.000Z",
        steamId: "222",
        players: 0
    });

    assert.equal(result.events.length, 1);

    const event = result.events[0];

    assert.equal(event.type, "SERVER_RESTART");
    assert.equal(event.classification, "PROCESS_RESTART");
    assert.equal(event.confidence, "CONFIRMED");
    assert.equal(event.reason, "STEAM_ID_ROTATION");
    assert.equal(event.previousSteamId, "111");
    assert.equal(event.currentSteamId, "222");
    assert.equal(event.restartAt, "2026-07-28T03:22:05.000Z");
    assert.equal(event.detectedAt, "2026-07-28T03:22:10.000Z");
    assert.equal(event.evidence.steamIdRotation.present, true);
    assert.equal(event.evidence.steamIdRotation.consecutiveReadings, 2);
    assert.equal(event.evidenceScore.role, "EXPLANATORY_ONLY");
    assert.equal(event.evidenceScore.total, 70);
    assert.equal(event.evidenceScore.level, "CONFIRMED");
    assert.equal(result.state.lastRestartAt, event.restartAt);
});

test("one failed query plus stable Steam ID rotation confirms a fast restart", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-27T19:21:11.000Z",
        steamId: "AAA",
        players: 58
    });

    processSample(tracker, {
        timestamp: "2026-07-27T19:21:32.000Z",
        success: false
    });

    processSample(tracker, {
        timestamp: "2026-07-27T19:21:42.000Z",
        steamId: "BBB",
        players: 0
    });

    const result = processSample(tracker, {
        timestamp: "2026-07-27T19:21:47.000Z",
        steamId: "BBB",
        players: 0
    });

    const event = result.events[0];

    assert.equal(event.classification, "PROCESS_RESTART");
    assert.equal(event.confidence, "CONFIRMED");
    assert.equal(event.restartAt, "2026-07-27T19:21:42.000Z");
    assert.equal(event.evidence.queryInterruption.present, true);
    assert.equal(event.evidence.queryInterruption.failedQueries, 1);
    assert.equal(event.evidence.rosterReset.present, true);
    assert.equal(event.evidence.rosterReset.before, 58);
    assert.equal(event.evidence.rosterReset.after, 0);
});

test("player connection-time reset is recorded as restart evidence", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-28T03:21:20.000Z",
        steamId: "OLD",
        players: 2,
        playerList: [
            { name: "kranky", time: 1550 },
            { name: "Nahku", time: 4305 }
        ]
    });

    processSample(tracker, {
        timestamp: "2026-07-28T03:22:16.000Z",
        steamId: "NEW",
        players: 1,
        playerList: [
            { name: "kranky", time: 5 }
        ]
    });

    const result = processSample(tracker, {
        timestamp: "2026-07-28T03:22:21.000Z",
        steamId: "NEW",
        players: 2,
        playerList: [
            { name: "kranky", time: 10 },
            { name: "Nahku", time: 7 }
        ]
    });

    const evidence =
        result.events[0].evidence.playerSessionReset;

    assert.equal(evidence.present, true);
    assert.deepEqual(
        evidence.players.sort(),
        ["Nahku", "kranky"]
    );
});

test("session continuity lowers evidence score but cannot veto stable rotation", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-28T04:00:00.000Z",
        steamId: "OLD",
        players: 1,
        playerList: [{ name: "Player", time: 300 }]
    });
    processSample(tracker, {
        timestamp: "2026-07-28T04:00:05.000Z",
        steamId: "NEW",
        players: 1,
        playerList: [{ name: "Player", time: 305 }]
    });
    const result = processSample(tracker, {
        timestamp: "2026-07-28T04:00:10.000Z",
        steamId: "NEW",
        players: 1,
        playerList: [{ name: "Player", time: 310 }]
    });
    const event = result.events[0];

    assert.equal(event.type, "SERVER_RESTART");
    assert.equal(event.confidence, "CONFIRMED");
    assert.equal(
        event.evidence.playerSessionContinuity.present,
        true
    );
    assert.equal(event.evidenceScore.total, 40);
    assert.equal(event.evidenceScore.level, "PROBABLE");
    assert.equal(result.state.lastRestartAt, event.restartAt);
});

test("transitional Steam ID is ignored and only the stable replacement is confirmed", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-27T17:43:37.000Z",
        steamId: "OLD",
        players: 9
    });

    processSample(tracker, {
        timestamp: "2026-07-27T17:43:57.000Z",
        success: false
    });

    const transitional = processSample(tracker, {
        timestamp: "2026-07-27T17:44:07.000Z",
        steamId: "90071992547409920",
        players: 0
    });

    assert.equal(transitional.events.length, 0);
    assert.equal(
        transitional.state.restartDetectionStatus,
        "VERIFYING"
    );

    const candidate = processSample(tracker, {
        timestamp: "2026-07-27T17:44:12.000Z",
        steamId: "NEW",
        players: 0
    });

    assert.equal(candidate.events.length, 0);
    assert.equal(candidate.state.restartCandidateSteamId, "NEW");

    const confirmed = processSample(tracker, {
        timestamp: "2026-07-27T17:44:18.000Z",
        steamId: "NEW",
        players: 0
    });

    const event = confirmed.events[0];

    assert.equal(event.previousSteamId, "OLD");
    assert.equal(event.currentSteamId, "NEW");
    assert.equal(event.restartAt, "2026-07-27T17:44:07.000Z");
    assert.equal(event.recoveredAt, "2026-07-27T17:44:07.000Z");
    assert.equal(event.stableSteamIdAt, "2026-07-27T17:44:12.000Z");
    assert.deepEqual(event.rejectedSteamIds, [
        "90071992547409920"
    ]);
});

test("candidate returning to the previous Steam ID is rejected", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-28T05:00:00.000Z",
        steamId: "111"
    });

    processSample(tracker, {
        timestamp: "2026-07-28T05:00:05.000Z",
        steamId: "222"
    });

    const result = processSample(tracker, {
        timestamp: "2026-07-28T05:00:10.000Z",
        steamId: "111"
    });

    assert.equal(result.events.length, 0);
    assert.equal(result.state.restartDetectionStatus, "ONLINE");
    assert.equal(result.state.restartCandidateSteamId, null);
    assert.equal(result.state.lastRestartAt, null);
});

test("offline-to-online recovery with unchanged Steam ID is not a process restart", () => {
    const tracker = new RestartTracker();

    processSample(tracker, {
        timestamp: "2026-07-28T06:00:00.000Z",
        steamId: "SAME",
        players: 4
    });

    processSample(tracker, {
        timestamp: "2026-07-28T06:01:00.000Z",
        success: false,
        reliabilityEvents: [
            {
                type: "SERVER_OFFLINE",
                message: "Server marked offline"
            }
        ]
    });

    const result = processSample(tracker, {
        timestamp: "2026-07-28T06:02:00.000Z",
        steamId: "SAME",
        players: 4,
        reliabilityEvents: [
            {
                type: "SERVER_ONLINE",
                message: "Server responding again"
            }
        ]
    });

    assert.equal(result.events.length, 0);
    assert.equal(result.state.lastRestartAt, null);
    assert.equal(result.state.restartDetectionStatus, "ONLINE");
});

test("Steam ID change across a long observation gap has no exact restart time", () => {
    const tracker = new RestartTracker();

    tracker.hydrate(
        "EU3",
        null,
        {
            success: true,
            timestamp: "2026-07-27T21:49:22.590Z",
            steamId: "OLD"
        }
    );

    processSample(tracker, {
        serverId: "EU3",
        timestamp: "2026-07-28T00:22:04.696Z",
        steamId: "NEW"
    });

    const result = processSample(tracker, {
        serverId: "EU3",
        timestamp: "2026-07-28T00:22:10.049Z",
        steamId: "NEW"
    });

    const event = result.events[0];

    assert.equal(
        event.classification,
        "PROCESS_RESTART_IN_OBSERVATION_GAP"
    );
    assert.equal(event.timeKnown, false);
    assert.equal(event.restartAt, null);
    assert.equal(event.confidence, "CONFIRMED");
    assert.equal(event.evidenceScore.total, 45);
    assert.equal(event.evidenceScore.level, "HIGH");
    assert.equal(
        event.observationWindow.start,
        "2026-07-27T21:49:22.590Z"
    );
    assert.equal(
        event.observationWindow.end,
        "2026-07-28T00:22:04.696Z"
    );
    assert.equal(result.state.lastRestartAt, null);
});
