const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_RESTART_AGE_MS, decide, Coordinator } = require("../dashboard/watchdogHydration");

const NOW = Date.parse("2026-07-30T12:00:00.000Z");
const eventAt = (timestamp, serverId = "EU1") => ({
    id: `${serverId}-${timestamp}`,
    serverId,
    timestamp,
    type: "SERVER_RESTART",
    data: { restartAt: timestamp, timeKnown: true }
});

test("strict eight-hour startup boundary is deterministic", () => {
    for (const server of ["EU1", "EU2", "EU3"]) {
        assert.equal(decide([eventAt(new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), server)], NOW).mode, "ON");
        assert.equal(decide([eventAt(new Date(NOW - MAX_RESTART_AGE_MS + 1).toISOString(), server)], NOW).mode, "ON");
        assert.equal(decide([eventAt(new Date(NOW - MAX_RESTART_AGE_MS).toISOString(), server)], NOW).mode, "AUTO");
        assert.equal(decide([eventAt(new Date(NOW - MAX_RESTART_AGE_MS - 1).toISOString(), server)], NOW).mode, "AUTO");
        assert.equal(decide([], NOW).mode, "AUTO");
        assert.equal(decide([eventAt(new Date(NOW + 1).toISOString(), server)], NOW).mode, "AUTO");
        assert.equal(decide([eventAt("invalid", server)], NOW).mode, "AUTO");
    }
});

function harness(eventsByServer, options = {}) {
    const modes = { EU1: "AUTO", EU2: "AUTO", EU3: "AUTO" };
    const restarts = { EU1: null, EU2: null, EU3: null };
    const revisions = { EU1: 0, EU2: 0, EU3: 0 };
    const completed = [];
    const coordinator = new Coordinator({
        now: () => NOW,
        fetchRestarts: async serverId => {
            const value = eventsByServer[serverId];
            if (value instanceof Error) throw value;
            return await value;
        },
        getManualRevision: serverId => revisions[serverId],
        getCurrentRestartAt: serverId => restarts[serverId],
        apply(serverId, result) { modes[serverId] = result.mode; restarts[serverId] = result.restartAt; },
        complete(serverId, result) { completed.push({ serverId, result }); }
    });
    return { coordinator, modes, restarts, revisions, completed };
}

test("EU1, EU2 and EU3 hydrate independently with different states", async () => {
    const recent = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    const old = new Date(NOW - 9 * 60 * 60 * 1000).toISOString();
    const state = harness({ EU1: [eventAt(recent, "EU1")], EU2: [eventAt(old, "EU2")], EU3: [] });
    await Promise.all(["EU1", "EU2", "EU3"].map(server => state.coordinator.hydrate("session-a", server)));
    assert.deepEqual(state.modes, { EU1: "ON", EU2: "AUTO", EU3: "AUTO" });
    assert.equal(state.restarts.EU1, Date.parse(recent));
    assert.equal(state.restarts.EU2, null);
    assert.equal(state.restarts.EU3, null);
    assert.equal(NOW - state.restarts.EU1, 2 * 60 * 60 * 1000);
});

test("API failure resolves to AUTO without rejection", async () => {
    const state = harness({ EU1: new Error("offline"), EU2: new Error("offline"), EU3: new Error("offline") });
    for (const server of ["EU1", "EU2", "EU3"]) {
        const result = await state.coordinator.hydrate("session-a", server);
        assert.equal(result.mode, "AUTO");
        assert.equal(state.modes[server], "AUTO");
    }
    assert.ok(state.completed.every(item => item.result.error.message === "offline"));
});

test("previous-session local ON or AUTO does not override authoritative age", async () => {
    const recent = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    const old = new Date(NOW - 9 * 60 * 60 * 1000).toISOString();
    const staleOn = harness({ EU1: [eventAt(old)] });
    staleOn.modes.EU1 = "ON";
    await staleOn.coordinator.hydrate("new-session", "EU1");
    assert.equal(staleOn.modes.EU1, "AUTO");
    const staleAuto = harness({ EU1: [eventAt(recent)] });
    await staleAuto.coordinator.hydrate("new-session", "EU1");
    assert.equal(staleAuto.modes.EU1, "ON");
});

test("late hydration cannot overwrite a manual decision", async () => {
    let resolveFetch;
    const pending = new Promise(resolve => { resolveFetch = resolve; });
    const state = harness({ EU1: pending });
    const hydration = state.coordinator.hydrate("session-a", "EU1");
    state.revisions.EU1 += 1;
    state.modes.EU1 = "OFF";
    resolveFetch([eventAt(new Date(NOW - 2 * 60 * 60 * 1000).toISOString())]);
    const result = await hydration;
    assert.equal(result.manualChanged, true);
    assert.equal(state.modes.EU1, "OFF");
});

test("a newer confirmed restart appearing during startup wins", async () => {
    let resolveFetch;
    const pending = new Promise(resolve => { resolveFetch = resolve; });
    const state = harness({ EU1: pending });
    const hydration = state.coordinator.hydrate("session-a", "EU1");
    const newer = NOW - 30 * 60 * 1000;
    state.restarts.EU1 = newer;
    resolveFetch([eventAt(new Date(NOW - 2 * 60 * 60 * 1000).toISOString())]);
    await hydration;
    assert.equal(state.modes.EU1, "ON");
    assert.equal(state.restarts.EU1, newer);
});

test("hydration runs once per server and session key", async () => {
    let calls = 0;
    const state = harness({ EU1: [] });
    state.coordinator.fetchRestarts = async () => { calls += 1; return []; };
    await state.coordinator.hydrate("session-a", "EU1");
    const second = await state.coordinator.hydrate("session-a", "EU1");
    assert.equal(calls, 1);
    assert.equal(second.skipped, true);
    await state.coordinator.hydrate("session-b", "EU1");
    assert.equal(calls, 2);
});

test("hydration is read-only and does not alter restart event count", async () => {
    const events = [eventAt(new Date(NOW - 2 * 60 * 60 * 1000).toISOString())];
    const before = events.length;
    const state = harness({ EU1: events });
    await state.coordinator.hydrate("session-a", "EU1");
    assert.equal(events.length, before);
});

test("dashboard persists hydration per backend session and preserves manual reload state", () => {
    const fs = require("node:fs");
    const html = fs.readFileSync(require("node:path").join(__dirname, "../dashboard/index.html"), "utf8");
    assert.match(html, /hydrated: watchdogHydrated/);
    assert.match(html, /stored\?\.id === sessionId/);
    assert.match(html, /watchdogManualRevision\[server\] \+= 1/);
    assert.match(html, /hydrateWatchdogsForSession\(sessionId\)/);
    assert.doesNotMatch(html, /saveEvent[\s\S]{0,200}hydrateWatchdogsForSession/);
});
