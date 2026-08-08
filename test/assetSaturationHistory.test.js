const test = require("node:test");
const assert = require("node:assert/strict");
const AssetSaturationHistory = require("../src/assetSaturationHistory");

test("asset history exposes seven deterministic ranges", () => {
    const history = new AssetSaturationHistory();
    assert.deepEqual(Object.fromEntries(Object.entries(AssetSaturationHistory.RANGE_CONFIG).map(([key, value]) => [key, value.bucketMs])), {
        "30m": 5000, "2h": 30000, "6h": 60000, "12h": 120000, "24h": 300000, "48h": 600000, "7d": 1800000
    });
    assert.equal(history.getRange("invalid"), null);
});

test("asset history uses only the latest server sample in each bucket", () => {
    const history = new AssetSaturationHistory();
    const startMs = Date.parse("2026-07-30T00:00:00Z");
    const snapshots = [
        ["EU1", 1000, 9], ["EU1", 4000, 3], ["EU2", 2000, 0], ["EU3", 3000, 0]
    ].map(([serverId, offset, players]) => ({ serverId, timestamp: new Date(startMs + offset).toISOString(), success: true, players }));
    const points = history.aggregate({ snapshots, serverIds: ["EU1", "EU2", "EU3"], startMs, endMs: startMs + 5000, bucketMs: 5000 });
    assert.equal(points[0].players, 3);
    assert.deepEqual(points[0].serverSamples, { EU1: 3, EU2: 0, EU3: 0 });
    assert.equal(Number.isInteger(points[0].players), true);
});

test("asset history returns a gap for an incomplete or failed server bucket", () => {
    const history = new AssetSaturationHistory();
    const startMs = Date.parse("2026-07-30T00:00:00Z");
    const snapshots = [
        { serverId: "EU1", timestamp: new Date(startMs + 1000).toISOString(), success: true, players: 3 },
        { serverId: "EU2", timestamp: new Date(startMs + 1000).toISOString(), success: false, players: null }
    ];
    const point = history.aggregate({ snapshots, serverIds: ["EU1", "EU2", "EU3"], startMs, endMs: startMs + 5000, bucketMs: 5000 })[0];
    assert.equal(point.players, null);
    assert.equal(point.complete, false);
});

test("48h output is deterministically bounded", () => {
    const history = new AssetSaturationHistory();
    const config = history.getRange("48h");
    const endMs = Date.parse("2026-07-30T12:00:00Z");
    const points = history.aggregate({ snapshots: [], serverIds: ["EU1", "EU2", "EU3"], startMs: endMs - config.durationMs, endMs, bucketMs: config.bucketMs });
    assert.equal(points.length, 288);
    assert.ok(points.every(point => point.players === null));
});


test("7d output stays useful and bounded without changing raw snapshots", () => {
    const history = new AssetSaturationHistory();
    const config = history.getRange("7d");
    const endMs = Date.parse("2026-07-30T12:00:00Z");
    const points = history.aggregate({
        snapshots: [],
        serverIds: ["EU1", "EU2", "EU3"],
        startMs: endMs - config.durationMs,
        endMs,
        bucketMs: config.bucketMs
    });
    assert.equal(points.length, 336);
    assert.equal(config.durationMs, 7 * 24 * 60 * 60 * 1000);
});
