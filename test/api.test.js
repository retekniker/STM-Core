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
    assert.deepEqual(
        response.body.series.map(series => series.serverId),
        ["EU1", "EU2"]
    );
    assert.equal(response.body.series[0].points[0].ping, 25);
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
        ["30m", "2h", "6h", "12h"]
    );
});
