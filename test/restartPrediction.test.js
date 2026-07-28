const test = require("node:test");
const assert = require("node:assert/strict");
const RestartPrediction = require("../src/restartPrediction");

function event(restartAt, overrides = {}) {
    return {
        type: "SERVER_RESTART",
        classification: "PROCESS_RESTART",
        timeKnown: true,
        restartAt,
        ...overrides
    };
}

test("prediction requires enough exact restart samples", () => {
    const prediction = new RestartPrediction();
    prediction.addEvent("EU1", event("2026-07-27T00:00:00.000Z"));
    prediction.addEvent("EU1", event("2026-07-27T08:00:00.000Z"));

    const result = prediction.getPrediction(
        "EU1",
        Date.parse("2026-07-27T09:00:00.000Z")
    );

    assert.equal(result.status, "INSUFFICIENT_DATA");
    assert.equal(result.predictedAt, null);
});

test("six hour model recognizes skipped cycles as multiples", () => {
    const prediction = new RestartPrediction();

    for (const restartAt of [
        "2026-07-27T00:00:00.000Z",
        "2026-07-27T06:03:00.000Z",
        "2026-07-27T18:01:00.000Z",
        "2026-07-28T00:02:00.000Z"
    ]) {
        prediction.addEvent("EU1", event(restartAt));
    }

    const result = prediction.getPrediction(
        "EU1",
        Date.parse("2026-07-28T01:00:00.000Z")
    );

    assert.equal(result.status, "PREDICTED");
    assert.equal(result.cycleKind, "STANDARD_6H");
    assert.equal(result.cycleHours, 6);
    assert.equal(result.sampleCount, 3);
    assert.equal(result.predictedAt, "2026-07-28T06:02:00.000Z");
});

test("eight hour model marks an additional restart as an outlier", () => {
    const prediction = new RestartPrediction();

    for (const restartAt of [
        "2026-07-27T03:00:00.000Z",
        "2026-07-27T11:02:00.000Z",
        "2026-07-27T13:30:00.000Z",
        "2026-07-27T19:01:00.000Z",
        "2026-07-28T03:03:00.000Z"
    ]) {
        prediction.addEvent("EU2", event(restartAt));
    }

    const result = prediction.getPrediction(
        "EU2",
        Date.parse("2026-07-28T04:00:00.000Z")
    );

    assert.equal(result.status, "PREDICTED");
    assert.equal(result.cycleKind, "STANDARD_8H");
    assert.equal(result.outliers.length, 1);
    assert.equal(
        result.outliers[0].restartAt,
        "2026-07-27T13:30:00.000Z"
    );
});

test("custom cycle is learned independently for each server", () => {
    const prediction = new RestartPrediction();

    for (const restartAt of [
        "2026-07-27T00:00:00.000Z",
        "2026-07-27T07:00:00.000Z",
        "2026-07-27T14:01:00.000Z",
        "2026-07-27T21:00:00.000Z",
        "2026-07-28T04:02:00.000Z"
    ]) {
        prediction.addEvent("EU3", event(restartAt));
    }

    prediction.addEvent("EU1", event("2026-07-27T00:00:00.000Z"));

    const eu3 = prediction.getPrediction(
        "EU3",
        Date.parse("2026-07-27T22:00:00.000Z")
    );
    const eu1 = prediction.getPrediction("EU1");

    assert.equal(eu3.status, "PREDICTED");
    assert.equal(eu3.cycleKind, "CUSTOM");
    assert.ok(Math.abs(eu3.cycleHours - 7) < 0.02);
    assert.equal(eu1.status, "INSUFFICIENT_DATA");
});

test("observation-gap restart is ignored as an exact sample", () => {
    const prediction = new RestartPrediction();
    const gapEvent = event(null, {
        classification: "PROCESS_RESTART_IN_OBSERVATION_GAP",
        timeKnown: false,
        observationWindow: {
            start: "2026-07-27T21:49:22.590Z",
            end: "2026-07-28T00:22:04.696Z"
        }
    });

    assert.equal(prediction.addEvent("EU3", gapEvent), false);
    assert.equal(
        prediction.getPrediction("EU3").eventCount,
        0
    );
});

test("legacy events require evidence of an instance change", () => {
    const prediction = new RestartPrediction();

    const changed = prediction.addEvent("EU1", {
        restartAt: "2026-07-28T03:43:17.006Z",
        reason: "STEAM_ID_ROTATION",
        previousSteamId: "OLD",
        currentSteamId: "NEW"
    });
    const unchanged = prediction.addEvent("EU1", {
        restartAt: "2026-07-28T13:56:11.111Z",
        reason: "OFFLINE_ONLINE_CYCLE",
        previousSteamId: "SAME",
        currentSteamId: "SAME"
    });

    assert.equal(changed, true);
    assert.equal(unchanged, false);
    assert.equal(
        prediction.getPrediction("EU1").eventCount,
        1
    );
});

test("replay of audited restarts remains in learning state", () => {
    const prediction = new RestartPrediction();
    const replay = {
        EU1: [
            "2026-07-27T19:21:42.207Z",
            "2026-07-28T03:22:05.916Z",
            "2026-07-28T03:43:17.006Z",
            "2026-07-28T11:43:28.627Z"
        ],
        EU2: [
            "2026-07-27T17:44:07.726Z",
            "2026-07-28T01:44:34.348Z",
            "2026-07-28T09:44:28.351Z",
            "2026-07-28T11:21:29.267Z",
            "2026-07-28T12:01:55.169Z"
        ],
        EU3: [
            "2026-07-27T15:34:48.230Z",
            "2026-07-28T03:42:51.943Z",
            "2026-07-28T11:43:08.593Z",
            "2026-07-28T12:00:50.021Z"
        ]
    };

    for (const [serverId, timestamps] of Object.entries(replay)) {
        prediction.hydrate(
            serverId,
            timestamps.map(timestamp => event(timestamp))
        );
    }

    const now = Date.parse("2026-07-28T12:10:00.000Z");

    assert.equal(prediction.getPrediction("EU1", now).status, "LEARNING");
    assert.equal(prediction.getPrediction("EU2", now).status, "LEARNING");
    assert.equal(prediction.getPrediction("EU3", now).status, "LEARNING");
});
