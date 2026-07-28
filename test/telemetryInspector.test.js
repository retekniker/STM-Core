const test = require("node:test");
const assert = require("node:assert/strict");
const {
    TelemetryInspectorController,
    RANGES
} = require("../dashboard/telemetryInspector");

test("inspector opens the selected server and preserves the selected range", () => {
    const changes = [];
    const controller = new TelemetryInspectorController({
        onChange: (state, reason) => changes.push({ state, reason })
    });
    const end = Date.parse("2026-07-28T12:00:00.000Z");

    controller.open("EU2", "12h", end);

    assert.equal(controller.serverId, "EU2");
    assert.equal(controller.range, "12h");
    assert.equal(controller.viewStart, end - RANGES["12h"]);
    assert.equal(controller.viewEnd, end);
    assert.equal(changes.at(-1).reason, "open");
});

test("inspector changes from 12h to 48h", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-28T12:00:00.000Z");
    controller.open("EU1", "12h", end);

    assert.equal(controller.setRange("48h", end), true);
    assert.equal(controller.range, "48h");
    assert.equal(controller.viewEnd - controller.viewStart, RANGES["48h"]);
});

test("LIVE returns the current view to the end of available data", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-28T12:00:00.000Z");
    controller.open("EU1", "2h", end);
    controller.zoom(0.5, 0.5);
    controller.pan(-20 * 60 * 1000);
    const width = controller.viewEnd - controller.viewStart;

    controller.live();

    assert.equal(controller.viewEnd, end);
    assert.equal(controller.viewEnd - controller.viewStart, width);
});

test("pan and cursor-centered zoom update the visible interval", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-28T12:00:00.000Z");
    controller.open("EU1", "6h", end);
    controller.zoom(0.5, 0.25);
    const zoomed = controller.snapshot();

    assert.equal(zoomed.viewEnd - zoomed.viewStart, RANGES["6h"] / 2);
    assert.equal(zoomed.needsDetail, false);
    controller.zoom(0.25, 0.5);
    assert.equal(controller.needsDetail(), true);
    const beforePan = controller.viewStart;
    controller.pan(5 * 60 * 1000);
    assert.equal(controller.viewStart, beforePan + 5 * 60 * 1000);
});

test("restart navigation and double-click focus use a 45 minute window", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-28T12:00:00.000Z");
    const first = "2026-07-28T08:00:00.000Z";
    const second = "2026-07-28T10:00:00.000Z";
    controller.open("EU3", "6h", end);
    controller.setOverview(end - RANGES["6h"], end, [
        { restartAt: first, timeKnown: true },
        { restartAt: second, timeKnown: true },
        { timeKnown: false, observationWindow: { start: first, end: second } }
    ]);

    assert.equal(controller.navigateRestart(1), Date.parse(second));
    assert.equal(controller.viewStart, Date.parse(second) - 15 * 60 * 1000);
    assert.equal(controller.viewEnd, Date.parse(second) + 30 * 60 * 1000);
    assert.equal(controller.needsDetail(), true);
});

test("inspector dashboard includes modal open and Escape close wiring", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const html = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");

    assert.match(html, /openTelemetryInspector\(wrapper\.id\.replace\('oscy-', ''\)\)/);
    assert.match(html, /event\.key === 'Escape'/);
    assert.match(html, /id="telemetryInspector"/);
    assert.match(html, /data-range="48h"/);
    assert.match(html, /telemetryInspectorOverlayPlugin/);
    assert.match(html, /EXACT TIME UNKNOWN/);
    assert.match(html, /scheduleTelemetryInspectorDetail/);
    assert.match(html, /resolution: 'raw'/);
    assert.match(html, /telemetryInspectorController\.pan/);
    assert.match(html, /telemetryInspectorController\.zoom/);
    assert.match(html, /telemetryInspectorController\.live/);
    assert.match(html, /telemetryInspectorController\.focusRestart/);
    assert.match(html, /kind: 'prediction'/);
});
