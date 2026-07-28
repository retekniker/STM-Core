const test = require("node:test");
const assert = require("node:assert/strict");
const TelemetryHistory = require("../src/telemetryHistory");

test("telemetry ranges are explicit and bounded", () => {
    const history = new TelemetryHistory();

    assert.equal(history.getRangeMs("30m"), 1800000);
    assert.equal(history.getRangeMs("2h"), 7200000);
    assert.equal(history.getRangeMs("6h"), 21600000);
    assert.equal(history.getRangeMs("12h"), 43200000);
    assert.equal(history.getRangeMs("24h"), 86400000);
    assert.equal(history.getRangeMs("48h"), 172800000);
    assert.equal(history.getRangeMs("8h"), null);
});

test("overview downsampling preserves extrema and status transitions", () => {
    const history = new TelemetryHistory();
    const startMs = Date.parse("2026-07-28T00:00:00.000Z");
    const endMs = startMs + 120000;
    const snapshots = Array.from({ length: 120 }, (_, index) => ({
        timestamp: new Date(startMs + index * 1000).toISOString(),
        success: index !== 55,
        ping: index === 31 ? 250 : 20 + index % 10,
        players: index === 45 ? 0 : 20 + index % 5,
        maxPlayers: 64
    }));

    const result = history.downsample(
        snapshots,
        startMs,
        endMs,
        { maximumPoints: 60 }
    );

    assert.ok(result.points.length <= 60);
    assert.ok(result.bucketSizeMs > 0);
    assert.ok(result.points.some(point => point.ping === 250));
    assert.ok(result.points.some(point => point.players === 0));
    assert.ok(result.points.some(point => point.status === "OFFLINE"));
    assert.ok(result.points.some(point => point.status === "ONLINE"));
    assert.ok(result.points.some(point => point.maxPing === 250));
    assert.ok(result.points.some(point => point.successRate < 1));
});

test("raw resolution returns every snapshot with exact values", () => {
    const history = new TelemetryHistory();
    const startMs = Date.parse("2026-07-28T00:00:00.000Z");
    const snapshots = [0, 1, 2].map(index => ({
        serverId: "EU1",
        timestamp: new Date(startMs + index * 5000).toISOString(),
        success: true,
        ping: 21 + index,
        players: 5 + index,
        maxPlayers: 64
    }));

    const series = history.buildSeries({
        serverIds: ["EU1"],
        snapshots,
        events: [],
        states: [],
        startMs,
        endMs: startMs + 10000,
        resolution: "raw"
    })[0];

    assert.equal(series.points.length, 3);
    assert.equal(series.points[2].ping, 23);
    assert.equal(series.metadata.sourceSnapshotCount, 3);
    assert.equal(series.metadata.returnedPointCount, 3);
    assert.equal(series.metadata.bucketSizeMs, 0);
});

test("series contains confirmed restart and prediction markers", () => {
    const history = new TelemetryHistory();
    const startMs = Date.parse("2026-07-28T00:00:00.000Z");
    const endMs = Date.parse("2026-07-28T12:00:00.000Z");
    const prediction = {
        status: "PREDICTED",
        predictedAt: "2026-07-28T13:00:00.000Z"
    };
    const events = [
        {
            serverId: "EU1",
            timestamp: "2026-07-28T03:22:10.000Z",
            data: {
                classification: "PROCESS_RESTART",
                confidence: "CONFIRMED",
                restartAt: "2026-07-28T03:22:05.000Z",
                previousSteamId: "OLD",
                currentSteamId: "NEW",
                evidence: {
                    steamIdRotation: { present: true }
                }
            }
        },
        {
            serverId: "EU1",
            timestamp: "2026-07-28T04:00:00.000Z",
            data: {
                reason: "OFFLINE_ONLINE_CYCLE",
                previousSteamId: "SAME",
                currentSteamId: "SAME"
            }
        }
    ];

    const result = history.buildSeries({
        serverIds: ["EU1"],
        snapshots: [],
        events,
        states: [{ id: "EU1", restartPrediction: prediction }],
        startMs,
        endMs
    })[0];

    assert.equal(result.restarts.length, 1);
    assert.equal(result.restarts[0].confidence, "CONFIRMED");
    assert.deepEqual(result.prediction, prediction);
});

test("observation-gap restart is represented as an interval", () => {
    const history = new TelemetryHistory();
    const startMs = Date.parse("2026-07-27T20:00:00.000Z");
    const endMs = Date.parse("2026-07-28T01:00:00.000Z");
    const result = history.buildSeries({
        serverIds: ["EU3"],
        snapshots: [],
        events: [{
            serverId: "EU3",
            timestamp: "2026-07-28T00:22:10.000Z",
            data: {
                classification: "PROCESS_RESTART_IN_OBSERVATION_GAP",
                confidence: "CONFIRMED",
                timeKnown: false,
                restartAt: null,
                observationWindow: {
                    start: "2026-07-27T21:49:22.590Z",
                    end: "2026-07-28T00:22:04.696Z"
                }
            }
        }],
        states: [],
        startMs,
        endMs
    })[0];

    assert.equal(result.restarts.length, 1);
    assert.equal(result.restarts[0].restartAt, null);
    assert.equal(result.restarts[0].timeKnown, false);
    assert.deepEqual(result.restarts[0].observationWindow, {
        start: "2026-07-27T21:49:22.590Z",
        end: "2026-07-28T00:22:04.696Z"
    });
});
