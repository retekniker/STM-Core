const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("../src/database");
const HistoryRepository = require("../src/historyRepository");
const ApiServer = require("../src/api");
const { ActivityFeedController } = require("../dashboard/activityFeed");

function routeHandler(api, routePath, method = "post") {
    const layer = api.app.router.stack.find(item => item.route?.path === routePath && item.route.methods[method]);
    return layer.route.stack.at(-1).handle;
}

function responseStub() {
    return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

async function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stm-activity-feed-"));
    const database = new Database(path.join(directory, "stm.db"));
    await database.init();
    const historyRepository = new HistoryRepository(database);
    return { directory, database, historyRepository };
}

test("activity feed cutoff survives database reinitialization and repeated writes", async t => {
    const data = await fixture();
    t.after(async () => { await data.database.close(); fs.rmSync(data.directory, { recursive: true, force: true }); });
    const first = "2026-07-29T10:00:00.000Z";
    const second = "2026-07-29T10:01:00.000Z";
    await data.database.setMetadata("activityFeedClearedAt", first, first);
    await data.database.setMetadata("activityFeedClearedAt", second, second);
    await data.database.close();
    await data.database.init();
    assert.equal((await data.database.getMetadata("activityFeedClearedAt")).value, second);
});

test("activity restart view filters at cutoff while authoritative restarts and telemetry rows remain", async t => {
    const data = await fixture();
    t.after(async () => { await data.database.close(); fs.rmSync(data.directory, { recursive: true, force: true }); });
    const before = "2026-07-29T09:00:00.000Z";
    const cutoff = "2026-07-29T10:00:00.000Z";
    const after = "2026-07-29T11:00:00.000Z";
    await data.database.saveEvent("EU1", { type: "SERVER_RESTART", restartAt: before }, before);
    await data.database.saveEvent("EU1", { type: "SERVER_RESTART", restartAt: after }, after);
    await data.database.saveSnapshot({ id: "EU1", timestamp: before, success: true, players: 1, maxPlayers: 64, ping: 20, playerList: [] });
    await data.database.setMetadata("activityFeedClearedAt", cutoff, cutoff);
    const api = new ApiServer({ stateEngine: { getAll: () => [], get: () => null }, historyRepository: data.historyRepository, database: data.database });
    const handler = routeHandler(api, "/api/v1/community/restarts", "get");
    const activityResponse = responseStub();
    await handler({ query: { view: "activity-feed", limit: "100" } }, activityResponse, error => { throw error; });
    const authoritativeResponse = responseStub();
    await handler({ query: { limit: "100" } }, authoritativeResponse, error => { throw error; });
    assert.equal(activityResponse.body.count, 1);
    assert.equal(authoritativeResponse.body.count, 2);
    assert.equal((await data.historyRepository.getServerSnapshots({ limit: 100 })).length, 1);
});

test("clear endpoint persists backend time, broadcasts once, and never deletes history", async t => {
    const data = await fixture();
    t.after(async () => { await data.database.close(); fs.rmSync(data.directory, { recursive: true, force: true }); });
    await data.database.saveEvent("EU2", { type: "SERVER_RESTART", restartAt: new Date().toISOString() });
    const broadcasts = [];
    const api = new ApiServer({
        stateEngine: { getAll: () => [], get: () => ({ lastRestartAt: "kept", uptimeSinceRestartSeconds: 42 }) },
        historyRepository: data.historyRepository,
        database: data.database,
        onActivityFeedCleared: value => broadcasts.push(value)
    });
    const response = responseStub();
    await routeHandler(api, "/api/v1/community/activity-feed/clear")({ body: { clearedAt: "attacker value" } }, response, error => { throw error; });
    assert.equal(response.body.success, true);
    assert.notEqual(response.body.clearedAt, "attacker value");
    assert.equal(broadcasts.length, 1);
    assert.equal((await data.historyRepository.getEvents({ type: "SERVER_RESTART" })).length, 1);
    assert.equal(api.stateEngine.get().lastRestartAt, "kept");
});

test("clear write failure is not reported as success", async () => {
    const api = new ApiServer({
        stateEngine: { getAll: () => [], get: () => null },
        historyRepository: { database: { getMetadata: async () => null }, getEvents: async () => [] },
        database: { setMetadata: async () => { throw new Error("disk full"); } }
    });
    let routedError = null;
    const response = responseStub();
    await routeHandler(api, "/api/v1/community/activity-feed/clear")({ body: {} }, response, error => { routedError = error; });
    assert.match(routedError.message, /disk full/);
    assert.equal(response.body, null);
});

test("controller ignores pre-cutoff entries and allows new entries", () => {
    const controller = new ActivityFeedController({ fetch: async () => ({ ok: true, json: async () => ({}) }), WebSocket: null });
    controller.renderActivity = () => {};
    controller.renderRestart = () => {};
    controller.applyClear("2026-07-29T10:00:00.000Z");
    assert.equal(controller.add({ timestamp: "2026-07-29T09:00:00.000Z", segments: [] }), null);
    assert.ok(controller.add({ timestamp: "2026-07-29T10:00:01.000Z", segments: [{ text: "<img onerror=alert(1)>" }] }));
    assert.equal(controller.entries.length, 1);
});

test("controller sends one clear request while pending and keeps entries on failure", async () => {
    let requests = 0;
    let resolveRequest;
    const responsePromise = new Promise(resolve => { resolveRequest = resolve; });
    const elements = {
        activityClearConfirm: { disabled: false },
        activityClearError: { textContent: "" },
        activityClearConfirmation: { classList: { remove() {} } }
    };
    const controller = new ActivityFeedController({
        fetch: async () => { requests += 1; return responsePromise; },
        WebSocket: null
    });
    controller.byId = id => elements[id] || null;
    controller.renderActivity = () => {};
    controller.renderRestart = () => {};
    controller.entries = [{ id: "kept", timestamp: new Date().toISOString(), segments: [] }];
    const first = controller.confirmClear();
    const second = controller.confirmClear();
    assert.equal(elements.activityClearConfirm.disabled, true);
    assert.equal(requests, 1);
    resolveRequest({ ok: false, status: 500 });
    await Promise.all([first, second]);
    assert.equal(controller.entries.length, 1);
    assert.match(elements.activityClearError.textContent, /CLEAR FAILED/);
    assert.equal(elements.activityClearConfirm.disabled, false);
});

test("synchronized cutoff clears two clients without preventing later entries", () => {
    const clients = [new ActivityFeedController(), new ActivityFeedController()];
    for (const client of clients) {
        client.renderActivity = () => {};
        client.renderRestart = () => {};
        client.entries = [{ id: "old", timestamp: "2026-07-29T09:00:00.000Z", segments: [] }];
        client.applyClear("2026-07-29T10:00:00.000Z");
        assert.equal(client.entries.length, 0);
        client.add({ timestamp: "2026-07-29T10:00:01.000Z", segments: [{ text: "new" }] });
        assert.equal(client.entries.length, 1);
    }
});

test("real panel targets open except controls and the actual scrollbar gutter", () => {
    const listeners = [];
    const panel = { addEventListener(type, listener) { if (type === "click") listeners.push(listener); } };
    const inert = { addEventListener() {}, classList: { contains: () => false } };
    const originalDocument = global.document;
    global.document = {
        getElementById(id) { return id === "activityFeedPanel" ? panel : inert; },
        querySelectorAll() { return []; },
        addEventListener() {},
        body: { classList: { add() {}, remove() {} } }
    };
    try {
        const controller = new ActivityFeedController({ fetch: async () => ({ ok: false }), WebSocket: null });
        let opens = 0;
        controller.setActivityFeedExpanded = expanded => { if (expanded) opens += 1; };
        controller.render = () => {};
        controller.init();
        controller.init();
        assert.equal(listeners.length, 1, "panel listener must only be attached once");
        const list = { offsetWidth: 200, clientWidth: 190, getBoundingClientRect: () => ({ right: 200 }) };
        const target = (kind, inList = false) => ({
            closest(selector) {
                if (selector === "button") return kind === "button" ? this : null;
                if (selector === ".custom-scrollbar") return inList ? list : null;
                return null;
            }
        });
        for (const [kind, inList, clientX] of [
            ["heading", false, 50],
            ["empty-panel", false, 50],
            ["entry-text", true, 50],
            ["entry-row", true, 100]
        ]) listeners[0]({ target: target(kind, inList), clientX });
        assert.equal(opens, 4);
        for (const kind of ["restart", "clear", "entry-close"])
            listeners[0]({ target: target("button"), clientX: 50 });
        listeners[0]({ target: target("scrollbar", true), clientX: 195 });
        assert.equal(opens, 4, "buttons and scrollbar gutter must not open the inspector");
    } finally {
        global.document = originalDocument;
    }
});

test("ZOOM and CLOSE share an idempotent expanded state and stop propagation", () => {
    const handlers = {};
    const attributes = new Map();
    const classes = new Set();
    const element = id => ({
        addEventListener(type, listener) { handlers[`${id}:${type}`] = listener; },
        setAttribute(name, value) { attributes.set(`${id}:${name}`, value); },
        classList: {
            toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
            contains(name) { return classes.has(name); }
        },
        focus() { attributes.set(`${id}:focused`, "true"); }
    });
    const elements = Object.fromEntries([
        "activityFeedPanel", "activityFeedZoom",
        "activityFeedInspector", "activityFeedInspectorClose",
        "activityClearCancel", "activityClearConfirm"
    ].map(id => [id, element(id)]));
    const originalDocument = global.document;
    global.document = {
        getElementById: id => elements[id] || null,
        querySelectorAll: () => [],
        addEventListener() {},
        body: { classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } }
    };
    try {
        const controller = new ActivityFeedController({ fetch: async () => ({ ok: false }), WebSocket: null });
        controller.render = () => {};
        controller.init();
        controller.mode = "restart";
        let stopped = 0;
        handlers["activityFeedZoom:click"]({ stopPropagation() { stopped += 1; } });
        assert.equal(controller.expanded, true);
        assert.equal(attributes.get("activityFeedInspector:aria-hidden"), "false");
        assert.equal(attributes.get("activityFeedPanel:aria-expanded"), "true");
        assert.equal(attributes.get("activityFeedZoom:aria-expanded"), "true");
        controller.setActivityFeedExpanded(true);
        assert.equal(controller.mode, "restart");
        handlers["activityFeedInspectorClose:click"]({ stopPropagation() { stopped += 1; } });
        assert.equal(controller.expanded, false);
        assert.equal(attributes.get("activityFeedInspector:aria-hidden"), "true");
        assert.equal(attributes.get("activityFeedPanel:aria-expanded"), "false");
        assert.equal(controller.mode, "restart");
        controller.setActivityFeedExpanded(false);
        assert.equal(stopped, 2);
    } finally {
        global.document = originalDocument;
    }
});

test("dashboard Activity Feed uses shared safe inspector and leaves chart endpoints independent", () => {
    const html = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "../dashboard/activityFeed.js"), "utf8");
    assert.match(html, /id="activityFeedInspector"/);
    assert.match(html, /YES — CLEAR/);
    assert.match(html, /NO — CANCEL/);
    assert.match(html, /Telemetry, restart markers, uptime and chart history will remain unchanged/);
    assert.match(source, /\["alertBox", "activityFeedInspectorBox"\]/);
    assert.match(source, /textContent = String\(segment\.text/);
    assert.match(source, /ACTIVITY_FEED_CLEARED/);
    assert.doesNotMatch(source, /view=activity-feed/);
    assert.match(html, /asset-status-label/);
    assert.match(html, /font-size: clamp\(/);
    assert.match(html, /\/api\/v1\/community\/telemetry\?range=/);
});


function clearActionFixture(scope) {
    let requests = 0;
    const values = new Map();
    const elements = {
        activityClearConfirm: { disabled: false },
        activityClearError: { textContent: "" },
        activityClearConfirmation: { classList: { remove() {} } }
    };
    const controller = new ActivityFeedController({
        fetch: async () => {
            requests += 1;
            return { ok: true, json: async () => ({ success: true, clearedAt: "2026-07-29T10:00:00.000Z" }) };
        },
        WebSocket: null,
        storage: {
            getItem(key) { return values.get(key) || null; },
            setItem(key, value) { values.set(key, value); }
        }
    });
    controller.byId = id => elements[id] || null;
    controller.renderActivity = () => {};
    controller.renderRestart = () => {};
    controller.entries = [{ id: "activity", timestamp: "2026-07-29T09:00:00.000Z" }];
    controller.restartEvents = [{ id: 1, timestamp: "2026-07-29T09:00:00.000Z", data: {} }];
    controller.clearScope = scope;
    return { controller, values, requests: () => requests };
}

test("Activity Feed Clear all clears only Activity Feed", async () => {
    const fixture = clearActionFixture("activity");
    await fixture.controller.confirmClear();
    assert.equal(fixture.controller.entries.length, 0);
    assert.equal(fixture.controller.restartEvents.length, 1);
    assert.equal(fixture.requests(), 1);
});

test("Restart Log Clear restart log clears only Restart Log", async () => {
    const fixture = clearActionFixture("restart");
    await fixture.controller.confirmClear();
    assert.equal(fixture.controller.entries.length, 1);
    assert.equal(fixture.controller.restartEvents.length, 0);
    assert.equal(fixture.requests(), 0);
    assert.ok(fixture.values.get("stm_restart_log_cleared_at"));
});

test("Restart Log Clear all clears both visible logs", async () => {
    const fixture = clearActionFixture("all");
    await fixture.controller.confirmClear();
    assert.equal(fixture.controller.entries.length, 0);
    assert.equal(fixture.controller.restartEvents.length, 0);
    assert.equal(fixture.requests(), 1);
});


test("enlarged log actions keep clear controls left and Close on the right", () => {
    const html = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    const header = html.slice(
        html.indexOf('<header class="activity-feed-toolbar">'),
        html.indexOf("</header>", html.indexOf('<header class="activity-feed-toolbar">'))
    );
    assert.ok(header.indexOf("activityFeedInspectorTitle") < header.indexOf("data-log-clear-all"));
    assert.ok(header.indexOf("data-log-clear-all") < header.indexOf("activity-feed-actions"));
    assert.ok(header.indexOf("data-restart-clear") < header.indexOf("activity-feed-actions"));
    assert.ok(header.indexOf("data-activity-restart-toggle") < header.indexOf("activityFeedInspectorClose"));
    assert.doesNotMatch(header, /RESTORE|activityFeedRestore/);
});
