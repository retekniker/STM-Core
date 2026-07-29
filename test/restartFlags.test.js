const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    formatRestartFlagParts,
    layoutRestartFlags,
    hitTestRestartFlags
} = require("../dashboard/restartFlags");

const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
const startMs = Date.parse("2026-07-29T08:00:00.000Z");
const endMs = Date.parse("2026-07-29T12:00:00.000Z");
const area = { left: 20, right: 420, top: 10, bottom: 110, width: 400, height: 100 };

function marker(time) {
    return { timestamp: new Date(time).toISOString(), classification: "PROCESS_RESTART" };
}

test("restart flag formatter emits RESTART date and time components in local UI time", () => {
    const parts = formatRestartFlagParts("2026-07-29T10:10:25.000Z");
    assert.match(parts.date, /^29\.07\.2026$/);
    assert.match(parts.time, /^\d{2}:10:25$/);
    assert.match(fs.readFileSync(path.join(__dirname, "../dashboard/restartFlags.js"), "utf8"), /fillText\("RESTART"/);
});

test("mini and Inspector create one bounded flag per visible restart", () => {
    const markers = [marker(startMs), marker((startMs + endMs) / 2), marker(endMs)];
    for (const variant of ["mini", "inspector"]) {
        const boxes = layoutRestartFlags(markers, { chartArea: area, startMs, endMs, variant });
        assert.equal(boxes.length, markers.length);
        boxes.forEach(box => {
            assert.ok(box.flag.left >= area.left);
            assert.ok(box.flag.right <= area.right);
            assert.ok(box.flag.top >= area.top);
            assert.ok(box.flag.bottom <= area.bottom);
        });
    }
    const shortArea = { left: 0, right: 120, top: 4, bottom: 54, width: 120, height: 50 };
    const compact = layoutRestartFlags([markers[1]], { chartArea: shortArea, startMs, endMs, variant: "mini" })[0];
    assert.ok(compact.flag.bottom <= shortArea.bottom);
});

test("flag, diamond and expanded line share the same restart hit target", () => {
    const box = layoutRestartFlags([marker((startMs + endMs) / 2)], { chartArea: area, startMs, endMs, variant: "mini" })[0];
    assert.equal(hitTestRestartFlags([box], box.flag.left + 2, box.flag.top + 2), box);
    assert.equal(hitTestRestartFlags([box], box.x, box.diamond.top + 2), box);
    assert.equal(hitTestRestartFlags([box], box.x + 7, area.bottom - 2), box);
    assert.ok(box.line.right - box.line.left > 1);
});

test("resize recomputes current CSS-pixel geometry without canvas bitmap dimensions", () => {
    const value = marker((startMs + endMs) / 2);
    const first = layoutRestartFlags([value], { chartArea: area, startMs, endMs, variant: "mini" })[0];
    const resized = { ...area, right: 820, width: 800 };
    const second = layoutRestartFlags([value], { chartArea: resized, startMs, endMs, variant: "mini" })[0];
    assert.notEqual(first.x, second.x);
    const source = fs.readFileSync(path.join(__dirname, "../dashboard/restartFlags.js"), "utf8");
    assert.doesNotMatch(source, /canvas\.width|canvas\.height|devicePixelRatio/);
});

test("nearby restart flags receive deterministic non-identical placements", () => {
    const markers = [marker(startMs + 1000), marker(startMs + 1100), marker(startMs + 1200)];
    const first = layoutRestartFlags(markers, { chartArea: area, startMs, endMs, variant: "mini" });
    const second = layoutRestartFlags(markers, { chartArea: area, startMs, endMs, variant: "mini" });
    assert.deepEqual(first.map(x => [x.flag.left, x.lane]), second.map(x => [x.flag.left, x.lane]));
    assert.ok(new Set(first.map(x => `${x.flag.left}:${x.lane}`)).size > 1);
});

test("restart overlays preserve chart scales, unknown gaps and navigator rendering", () => {
    assert.match(dashboard, /RestartFlags\.layoutRestartFlags/);
    assert.match(dashboard, /RestartFlags\.hitTestRestartFlags/);
    assert.match(dashboard, /tooltip\?\.setActiveElements\(\[\]/);
    assert.match(dashboard, /chartInstance\.\$restartFlagHitboxes/);
    assert.match(dashboard, /breakTelemetryGaps\(visiblePoints/);
    assert.match(dashboard, /renderTelemetryInspectorNavigator/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../dashboard/restartFlags.js"), "utf8"), /scales|chartArea\.height\s*=/);
});
