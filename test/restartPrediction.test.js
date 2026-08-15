const test = require("node:test");
const assert = require("node:assert/strict");
const RestartPrediction = require("../src/restartPrediction");

const HOUR = 60 * 60 * 1000;
const BASE = Date.parse("2026-07-27T00:00:00.000Z");

function event(restartAt, overrides = {}) {
    return {
        type: "SERVER_RESTART",
        classification: "PROCESS_RESTART",
        timeKnown: true,
        restartAt,
        ...overrides
    };
}

function addIntervals(prediction, serverId, intervals) {
    let timestamp = BASE;
    prediction.addEvent(serverId, event(new Date(timestamp).toISOString()));
    for (const interval of intervals) {
        timestamp += interval * HOUR;
        prediction.addEvent(serverId, event(new Date(timestamp).toISOString()));
    }
    return timestamp;
}

test("prediction requires four exact restart events", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU1", [8]);
    const result = prediction.getPrediction("EU1", last + HOUR);

    assert.equal(result.status, "INSUFFICIENT_DATA");
    assert.equal(result.predictedAt, null);
});

test("stable eight hour history predicts the next eight hour restart", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU1", [8, 8, 8, 8]);
    const result = prediction.getPrediction("EU1", last + HOUR);

    assert.equal(result.status, "PREDICTED");
    assert.equal(result.cycleKind, "STANDARD_8H");
    assert.equal(result.cycleHours, 8);
    assert.equal(result.predictedAt, new Date(last + 8 * HOUR).toISOString());
    assert.ok(result.confidence > 0.9);
});

test("small restart jitter remains in one eight hour cluster", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU1", [7 + 58 / 60, 8 + 4 / 60, 8 + 1 / 60, 7 + 57 / 60, 8 + 2 / 60]);
    const result = prediction.getPrediction("EU1", last + HOUR);

    assert.equal(result.status, "PREDICTED");
    assert.equal(result.cycleKind, "STANDARD_8H");
    assert.ok(result.confidence > 0.85);
});

test("one four hour outlier cannot divide a stable eight hour cycle", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU1", [8, 8, 4, 8, 8]);
    const result = prediction.getPrediction("EU1", last + HOUR);

    assert.equal(result.status, "PREDICTED");
    assert.equal(result.cycleHours, 8);
    assert.equal(result.outliers.length, 1);
    assert.equal(result.outliers[0].restartAt, new Date(BASE + 20 * HOUR).toISOString());
    assert.equal(result.predictedAt, new Date(last + 8 * HOUR).toISOString());
});

test("three consecutive six hour intervals switch a previous eight hour schedule", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU2", [8, 8, 8, 6, 6, 6]);
    const result = prediction.getPrediction("EU2", last + HOUR);

    assert.equal(result.status, "PREDICTED");
    assert.equal(result.cycleKind, "STANDARD_6H");
    assert.equal(result.scheduleChanged, true);
    assert.equal(result.predictedAt, new Date(last + 6 * HOUR).toISOString());
});

test("chaotic intervals remain in learning instead of inventing a cycle", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU3", [3, 11, 5, 9, 14]);
    const result = prediction.getPrediction("EU3", last + HOUR);

    assert.equal(result.status, "LEARNING");
    assert.equal(result.predictedAt, null);
});

test("seven day window excludes old restart schedules", () => {
    const prediction = new RestartPrediction();
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const old = now - 10 * 24 * HOUR;

    for (const offset of [0, 8, 16, 24, 32]) {
        prediction.addEvent("EU1", event(new Date(old + offset * HOUR).toISOString()));
    }
    for (const offset of [0, 6, 12, 18]) {
        prediction.addEvent("EU1", event(new Date(now - 19 * HOUR + offset * HOUR).toISOString()));
    }

    const result = prediction.getPrediction("EU1", now);
    assert.equal(result.cycleKind, "STANDARD_6H");
    assert.equal(result.eventCount, 4);
});

test("server histories remain independent", () => {
    const prediction = new RestartPrediction();
    const eu1Last = addIntervals(prediction, "EU1", [8, 8, 8]);
    const eu2Last = addIntervals(prediction, "EU2", [6, 6, 6]);

    assert.equal(prediction.getPrediction("EU1", eu1Last + HOUR).cycleHours, 8);
    assert.equal(prediction.getPrediction("EU2", eu2Last + HOUR).cycleHours, 6);
});

test("observation-gap restarts are excluded from prediction samples", () => {
    const prediction = new RestartPrediction();
    const gapEvent = event(null, {
        classification: "PROCESS_RESTART_IN_OBSERVATION_GAP",
        timeKnown: false
    });

    assert.equal(prediction.addEvent("EU3", gapEvent), false);
    assert.equal(prediction.getPrediction("EU3", BASE).eventCount, 0);
});

test("legacy events require an actual instance change", () => {
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
        prediction.getPrediction("EU1", Date.parse("2026-07-28T14:00:00.000Z")).eventCount,
        1
    );
});

test("duplicate exact restart timestamps are ignored", () => {
    const prediction = new RestartPrediction();
    const value = "2026-07-28T03:43:17.006Z";

    assert.equal(prediction.addEvent("EU1", event(value)), true);
    assert.equal(prediction.addEvent("EU1", event(value)), false);
});

test("a prediction becomes stale instead of advancing an unobserved schedule", () => {
    const prediction = new RestartPrediction();
    const last = addIntervals(prediction, "EU1", [8, 8, 8]);
    const result = prediction.getPrediction("EU1", last + 18 * HOUR);

    assert.equal(result.status, "STALE");
    assert.equal(result.predictedAt, null);
});
