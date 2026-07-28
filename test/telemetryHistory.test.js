const test = require("node:test");
const assert = require("node:assert/strict");
const TelemetryHistory = require("../src/telemetryHistory");

test("telemetry ranges are explicit and bounded", () => {
    const history = new TelemetryHistory();

    assert.equal(history.getRangeMs("30m"), 1800000);
    assert.equal(history.getRangeMs("2h"), 7200000);
    assert.equal(history.getRangeMs("6h"), 21600000);
    assert.equal(history.getRangeMs("12h"), 43200000);
    assert.equal(history.getRangeMs("8h"), null);
});

test("snapshot downsampling returns at most the configured points", () => {
    const history = new TelemetryHistory({
        maximumPoints: 3
    });
    const startMs = Date.parse("2026-07-28T00:00:00.000Z");
    const endMs = startMs + 12000;
    const snapshots = Array.from({ length: 12 }, (_, index) => ({
        timestamp: new Date(startMs + index * 1000).toISOString(),
        success: index !== 5,
        ping: 20 + index,
        players: index,
        maxPlayers: 64
    }));

    const points = history.downsample(
        snapshots,
        startMs,
        endMs
    );

    assert.equal(points.length, 3);
    assert.equal(points[0].samples, 4);
    assert.equal(points[1].status, "DEGRADED");
    assert.equal(points[2].maxPlayers, 64);
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
