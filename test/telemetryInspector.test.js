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

test("inspector supports a bounded seven-day overview", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-08-09T12:00:00.000Z");
    controller.open("EU3", "12h", end);

    assert.equal(controller.setRange("7d", end), true);
    assert.equal(controller.range, "7d");
    assert.equal(controller.viewEnd - controller.viewStart, RANGES["7d"]);
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
    controller.setOverview(end - RANGES["6h"], end);
    controller.setRestarts([
        { restartAt: first, timeKnown: true },
        { restartAt: second, timeKnown: true },
        { timeKnown: false, observationWindow: { start: first, end: second } }
    ]);

    assert.equal(controller.navigateRestart(1), Date.parse(second));
    assert.equal(controller.viewStart, Date.parse(second) - 15 * 60 * 1000);
    assert.equal(controller.viewEnd, Date.parse(second) + 30 * 60 * 1000);
    assert.equal(controller.needsDetail(), true);
});

test("restart cursor traverses five authoritative markers in both directions", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-30T12:00:00Z");
    const times = [8, 9, 10, 11, 11.5].map(hour => end - hour * 60 * 60 * 1000);
    controller.open("EU1", "12h", end);
    controller.setOverview(end - RANGES["12h"], end);
    controller.setRestarts(times.map((time, id) => ({ id, restartAt: new Date(time).toISOString() })).concat([
        { id: 4, restartAt: new Date(times[4]).toISOString() }
    ]));

    const visited = [0, 1, 2, 3].map(() => controller.navigateRestart(-1));
    assert.deepEqual(visited, [times[1], times[2], times[3], times[4]]);
    assert.equal(controller.navigateRestart(1), times[3]);
    assert.equal(controller.navigateRestart(-1), times[4]);
    const oldest = controller.snapshot();
    assert.equal(oldest.restartIndex, 0);
    assert.equal(oldest.canPreviousRestart, false);
    assert.equal(oldest.canNextRestart, true);
    assert.equal(oldest.viewStart, times[4] - 15 * 60 * 1000);
});

test("range, LIVE, RESET VIEW, server change and reopen keep restart endpoints honest", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-30T12:00:00Z");
    const markers = [5, 4, 3, 2, 1].map((hours, id) => ({
        id,
        restartAt: new Date(end - hours * 60 * 60 * 1000).toISOString()
    }));

    controller.open("EU1", "12h", end);
    controller.setRestarts(markers.concat(markers[2]));
    assert.equal(controller.snapshot().restartCount, 5);
    assert.equal(controller.snapshot().canNextRestart, false);
    controller.navigateRestart(-1);
    controller.navigateRestart(-1);
    assert.equal(controller.snapshot().restartIndex, 2);

    controller.live();
    assert.equal(controller.snapshot().restartIndex, 4);
    assert.equal(controller.snapshot().canNextRestart, false);
    controller.navigateRestart(-1);
    controller.reset();
    assert.equal(controller.snapshot().restartIndex, 4);

    controller.setRange("48h", end);
    assert.equal(controller.snapshot().restartIndex, 4);
    assert.equal(controller.snapshot().canNextRestart, false);

    controller.open("EU2", "30m", end);
    assert.equal(controller.snapshot().restartCount, 0);
    assert.equal(controller.snapshot().canPreviousRestart, false);
    controller.setRestarts(markers.slice(0, 2));
    assert.equal(controller.snapshot().restartIndex, 1);
    controller.open("EU2", "30m", end);
    assert.equal(controller.snapshot().restartCount, 0);
});

test("direct restart focus synchronizes the chronological cursor", () => {
    const controller = new TelemetryInspectorController();
    const end = Date.parse("2026-07-30T12:00:00Z");
    const markers = [4, 3, 2, 1, 0].map((hours, id) => ({
        id,
        restartAt: new Date(end - hours * 60 * 60 * 1000).toISOString()
    }));
    controller.open("EU3", "6h", end);
    controller.setRestarts(markers);

    controller.focusRestart(markers[1].restartAt);
    assert.equal(controller.snapshot().restartIndex, 1);
    assert.equal(controller.navigateRestart(1), Date.parse(markers[2].restartAt));
    assert.equal(controller.navigateRestart(-1), Date.parse(markers[1].restartAt));
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
    assert.match(html, /data-range="7d"/);
    assert.match(html, /EXACT TIME UNKNOWN/);
    assert.match(html, /scheduleTelemetryInspectorDetail/);
    assert.match(html, /resolution: 'raw'/);
    assert.match(html, /telemetryInspectorController\.pan/);
    assert.match(html, /telemetryInspectorController\.zoom/);
    assert.match(html, /telemetryInspectorController\.live/);
    assert.match(html, /telemetryInspectorController\.focusRestart/);
    assert.match(html, /kind: 'prediction'/);
});
