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
});
