const test = require("node:test");
const assert = require("node:assert/strict");
const ApiServer = require("../src/api");

function getTelemetryHandler(api) {
    const layer = api.app.router.stack.find(item =>
        item.route?.path ===
            "/api/v1/community/telemetry"
    );

    return layer.route.stack.at(-1).handle;
}

function getRestartHandler(api) {
    const layer = api.app.router.stack.find(item =>
        item.route?.path ===
            "/api/v1/community/restarts"
    );

    return layer.route.stack.at(-1).handle;
}

function getAssetSaturationHandler(api) {
    const layer = api.app.router.stack.find(item =>
        item.route?.path === "/api/v1/community/asset-saturation"
    );
    return layer.route.stack.at(-1).handle;
}

function getServerHandler(api) {
    const layer = api.app.router.stack.find(item =>
        item.route?.path === "/api/v1/community/servers/:serverId"
    );
    return layer.route.stack.at(-1).handle;
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(value) {
            this.statusCode = value;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        }
    };
}

test("telemetry endpoint returns bounded series for all servers", async () => {
    const timestamp = new Date().toISOString();
    const historyRepository = {
        async getServerSnapshotsBetween({ serverId }) {
            return [{
                serverId,
                timestamp,
                success: true,
                players: 3,
                maxPlayers: 64,
                ping: 25
            }];
        },
        async getEvents() {
            return [];
        }
    };
    const stateEngine = {
        getAll() {
            return [
                { id: "EU1", restartPrediction: { status: "LEARNING" } },
                { id: "EU2", restartPrediction: { status: "INSUFFICIENT_DATA" } }
            ];
        },
        get() {
            return null;
        }
    };
    const api = new ApiServer({
        stateEngine,
        historyRepository
    });
    const response = createResponse();
    let routeError = null;

    await getTelemetryHandler(api)(
        { query: { range: "2h" } },
        response,
        error => {
            routeError = error;
        }
    );

    assert.equal(routeError, null);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.range, "2h");
    assert.equal(response.body.maximumPoints, 360);
    assert.equal(response.body.resolution, "overview");
    assert.equal(response.body.sourceSnapshotCount, 2);
    assert.equal(response.body.returnedPointCount, 2);
    assert.deepEqual(
        response.body.series.map(series => series.serverId),
        ["EU1", "EU2"]
    );
    assert.equal(response.body.series[0].points[0].ping, 25);
});

test("server endpoint exposes the backend monitoring-session start", () => {
    const api = new ApiServer({
        stateEngine: {
            getAll: () => [],
            get: id => ({ id, status: "ONLINE" })
        }
    });
    const response = createResponse();

    getServerHandler(api)({ params: { serverId: "EU1" } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.monitorStartedAt, api.startedAt.toISOString());
    assert.equal(response.body.server.id, "EU1");
});

test("asset saturation endpoint aggregates SQLite snapshots and rejects invalid ranges", async () => {
    const now = Date.now();
    const historyRepository = {
        async getServerSnapshotsBetween() {
            return ["EU1", "EU2", "EU3"].map((serverId, index) => ({
                serverId,
                timestamp: new Date(now - 1000).toISOString(),
                success: true,
                players: index === 0 ? 3 : 0
            }));
        }
    };
    const api = new ApiServer({
        stateEngine: { getAll: () => ["EU1", "EU2", "EU3"].map(id => ({ id })), get: () => null },
        historyRepository
    });
    const response = createResponse();
    await getAssetSaturationHandler(api)({ query: { range: "30m" } }, response, error => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.bucketSizeMs, 5000);
    assert.ok(response.body.points.some(point => point.players === 3));
    assert.ok(response.body.points.every(point => point.players === null || Number.isInteger(point.players)));

    const invalid = createResponse();
    await getAssetSaturationHandler(api)({ query: { range: "8h" } }, invalid, error => { throw error; });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error, "INVALID_ASSET_SATURATION_RANGE");
});

test("telemetry endpoint rejects unsupported ranges", async () => {
    const api = new ApiServer({
        stateEngine: {
            getAll: () => [],
            get: () => null
        },
        historyRepository: {
            getServerSnapshotsBetween: async () => [],
            getEvents: async () => []
        }
    });
    const response = createResponse();

    await getTelemetryHandler(api)(
        { query: { range: "8h" } },
        response,
        error => {
            throw error;
        }
    );

    assert.equal(response.statusCode, 400);
    assert.equal(
        response.body.error,
        "INVALID_TELEMETRY_RANGE"
    );
    assert.deepEqual(
        response.body.allowedRanges,
        ["30m", "2h", "6h", "12h", "24h", "48h"]
    );
});

test("telemetry endpoint supports 24h and 48h overview windows", async () => {
    const calls = [];
    const api = new ApiServer({
        stateEngine: {
            getAll: () => [{ id: "EU1" }],
            get: () => null
        },
        historyRepository: {
            getServerSnapshotsBetween: async options => {
                calls.push(options);
                return [];
            },
            getEvents: async () => []
        }
    });

    for (const range of ["24h", "48h"]) {
        const response = createResponse();
        await getTelemetryHandler(api)(
            { query: { range, serverId: "EU1", maxPoints: "720" } },
            response,
            error => { throw error; }
        );
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.maximumPoints, 720);
        assert.equal(response.body.series.length, 1);
        assert.equal(response.body.series[0].serverId, "EU1");
    }

    assert.ok(Date.parse(calls[0].before) - Date.parse(calls[0].after) >= 86399950);
    assert.ok(Date.parse(calls[1].before) - Date.parse(calls[1].after) >= 172799950);
});

test("telemetry endpoint supports custom raw window and metadata", async () => {
    const from = "2026-07-28T10:00:00.000Z";
    const to = "2026-07-28T10:30:00.000Z";
    const snapshots = [from, to].map((timestamp, index) => ({
        serverId: "EU2",
        timestamp,
        success: true,
        players: index,
        maxPlayers: 64,
        ping: 20 + index
    }));
    const api = new ApiServer({
        stateEngine: {
            getAll: () => [{ id: "EU2" }],
            get: () => null
        },
        historyRepository: {
            getServerSnapshotsBetween: async () => snapshots,
            getEvents: async () => []
        }
    });
    const response = createResponse();

    await getTelemetryHandler(api)(
        { query: { range: "30m", from, to, resolution: "raw", serverId: "EU2" } },
        response,
        error => { throw error; }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.requestedFrom, from);
    assert.equal(response.body.requestedTo, to);
    assert.equal(response.body.actualFrom, from);
    assert.equal(response.body.actualTo, to);
    assert.equal(response.body.resolution, "raw");
    assert.equal(response.body.bucketSizeMs, 0);
    assert.equal(response.body.sourceSnapshotCount, 2);
    assert.equal(response.body.returnedPointCount, 2);
});

test("telemetry endpoint rejects oversized raw and invalid requests", async () => {
    const api = new ApiServer({
        stateEngine: {
            getAll: () => [{ id: "EU1" }],
            get: () => null
        },
        historyRepository: {
            getServerSnapshotsBetween: async () => [],
            getEvents: async () => []
        }
    });
    const cases = [
        [{ range: "2h", resolution: "raw" }, 413, "RAW_TELEMETRY_WINDOW_TOO_LARGE"],
        [{ range: "30m", from: "2026-07-28T10:00:00Z" }, 400, "TELEMETRY_WINDOW_REQUIRES_FROM_AND_TO"],
        [{ range: "30m", from: "invalid", to: new Date().toISOString() }, 400, "INVALID_TELEMETRY_DATE"],
        [{ range: "30m", from: "2026-07-28T10:00:00Z", to: "2026-07-28T09:00:00Z" }, 400, "INVALID_TELEMETRY_WINDOW_ORDER"],
        [{ range: "30m", resolution: "average" }, 400, "INVALID_TELEMETRY_RESOLUTION"],
        [{ range: "30m", serverId: "EU9" }, 404, "UNKNOWN_SERVER_ID"]
    ];

    for (const [query, status, error] of cases) {
        const response = createResponse();
        await getTelemetryHandler(api)(
            { query },
            response,
            routeError => { throw routeError; }
        );
        assert.equal(response.statusCode, status);
        assert.equal(response.body.error, error);
    }
});

test("restart endpoint dynamically enriches stored event data", async () => {
    const storedEvent = {
        id: 1,
        serverId: "EU1",
        timestamp: "2026-07-28T03:22:10.000Z",
        type: "SERVER_RESTART",
        data: {
            classification: "PROCESS_RESTART",
            restartAt: "2026-07-28T03:22:05.916Z"
        }
    };
    const api = new ApiServer({
        stateEngine: {
            getAll: () => [],
            get: () => null
        },
        historyRepository: {
            getEvents: async () => [storedEvent]
        },
        restartPrediction: {
            getPrediction: () => ({
                status: "PREDICTED",
                cycleHours: 8,
                confidence: 0.9,
                inliers: [{
                    restartAt:
                        storedEvent.data.restartAt
                }],
                outliers: []
            })
        }
    });
    const response = createResponse();

    await getRestartHandler(api)(
        { query: { limit: "100" } },
        response,
        error => {
            throw error;
        }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(
        response.body.events[0]
            .predictionAssessment.classification,
        "REGULAR"
    );
    assert.equal(storedEvent.predictionAssessment, undefined);
});
