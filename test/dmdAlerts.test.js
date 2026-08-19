const test = require("node:test");
const assert = require("node:assert/strict");
const {
    DmdAlertController,
    RestartLiveGate,
    DMD_ALERT_DURATIONS
} = require("../dashboard/dmdAlerts");

function harness(options = {}) {
    let now = options.now ?? Date.parse("2026-08-19T10:00:00.000Z");
    const rendered = [];
    let resets = 0;
    const timers = new Map();
    let timerId = 0;
    const controller = new DmdAlertController({
        now: () => now,
        setTimer(callback, delay) {
            const id = ++timerId;
            timers.set(id, { callback, at: now + delay });
            return id;
        },
        clearTimer(id) { timers.delete(id); },
        renderAlert: options.renderAlert || (item => rendered.push(item)),
        renderDefault() { resets++; }
    });
    return {
        controller,
        rendered,
        timers,
        get resets() { return resets; },
        setNow(value) { now = value; },
        advance(ms) { now += ms; controller.refresh(); }
    };
}

test("DMD severity durations are explicit and bounded", () => {
    assert.deepEqual(DMD_ALERT_DURATIONS, {
        info: 4000,
        success: 5000,
        warning: 7000,
        critical: 10000
    });
    const state = harness();
    state.controller.enqueue({ text: "critical", severity: "critical", durationMs: 50000 });
    assert.equal(state.controller.active.expiresAt - state.controller.active.receivedAt, 12000);
});

test("historical restart establishes a baseline without a live critical", () => {
    const now = Date.parse("2026-08-19T10:00:00.000Z");
    const gate = new RestartLiveGate({ now: () => now });
    const result = gate.observe({
        monitoringSessionId: "session-a",
        serverId: "EU1",
        detectedAt: "2026-08-19T09:00:00.000Z"
    });
    assert.equal(result.live, false);
    assert.equal(result.reason, "BASELINE");
});

test("a fresh restart is live exactly once and its duplicate is ignored", () => {
    let now = Date.parse("2026-08-19T10:00:00.000Z");
    const gate = new RestartLiveGate({ now: () => now });
    gate.observe({ monitoringSessionId: "session-a", serverId: "EU1", detectedAt: null });
    now += 5000;
    const event = { monitoringSessionId: "session-a", serverId: "EU1", detectedAt: new Date(now).toISOString() };
    assert.equal(gate.observe(event).live, true);
    assert.equal(gate.observe(event).live, false);
});

test("critical interrupts active info and warning is ordered before queued info", () => {
    const state = harness();
    state.controller.enqueue({ text: "active info", severity: "info" });
    state.controller.enqueue({ text: "waiting info", severity: "info" });
    state.controller.enqueue({ text: "warning", severity: "warning" });
    state.controller.enqueue({ text: "critical", severity: "critical" });
    assert.equal(state.controller.active.text, "critical");
    assert.deepEqual(state.controller.queue.map(item => item.text), ["warning", "waiting info"]);
});

test("expired active alert is removed immediately after returning from minimization", () => {
    const state = harness();
    state.controller.enqueue({ text: "warning", severity: "warning" });
    state.advance(7001);
    assert.equal(state.controller.active, null);
    assert.equal(state.resets, 1);
});

test("critical restarts for different servers remain separately queued", () => {
    const state = harness();
    state.controller.enqueue({ text: "EU1", severity: "critical", dedupeKey: "restart-eu1", monitoringSessionId: "s" });
    state.controller.enqueue({ text: "EU2", severity: "critical", dedupeKey: "restart-eu2", monitoringSessionId: "s" });
    assert.equal(state.controller.active.text, "EU1");
    assert.deepEqual(state.controller.queue.map(item => item.text), ["EU2"]);
    state.advance(10000);
    assert.equal(state.controller.active.text, "EU2");
});

test("backend restart creates new baselines and never replays history", () => {
    let now = Date.parse("2026-08-19T10:00:00.000Z");
    const gate = new RestartLiveGate({ now: () => now });
    gate.observe({ monitoringSessionId: "session-a", serverId: "EU1", detectedAt: "2026-08-19T09:00:00.000Z" });
    now += 5000;
    assert.equal(gate.observe({ monitoringSessionId: "session-a", serverId: "EU1", detectedAt: new Date(now).toISOString() }).live, true);
    const restarted = gate.observe({ monitoringSessionId: "session-b", serverId: "EU1", detectedAt: new Date(now).toISOString() });
    assert.equal(restarted.live, false);
    assert.equal(restarted.reason, "BASELINE");
});

test("alerts older than thirty seconds are log-only and never enter DMD", () => {
    const state = harness();
    const accepted = state.controller.enqueue({
        text: "stale",
        severity: "critical",
        occurredAt: Date.parse("2026-08-19T09:59:29.000Z")
    });
    assert.equal(accepted, false);
    assert.equal(state.controller.active, null);
    assert.equal(state.rendered.length, 0);
});

test("DMD queue is limited to twenty waiting alerts", () => {
    const state = harness();
    state.controller.enqueue({ text: "active", severity: "critical" });
    for (let index = 0; index < 30; index++) {
        state.controller.enqueue({ text: `info-${index}`, severity: "info", dedupeKey: `info-${index}` });
    }
    assert.equal(state.controller.queue.length, 20);
});

test("render failure resets DMD and continues safely", () => {
    let calls = 0;
    const state = harness({
        renderAlert() {
            calls++;
            throw new Error("display failed");
        }
    });
    state.controller.enqueue({ text: "broken", severity: "warning" });
    assert.equal(calls, 1);
    assert.equal(state.controller.active, null);
    assert.equal(state.resets, 1);
});
