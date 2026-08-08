const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "dashboard/index.html"), "utf8");
const mobile = fs.readFileSync(path.join(root, "dashboard/mobile.css"), "utf8");

test("dashboard loads the mobile foundation with safe viewport support", () => {
    assert.match(dashboard, /viewport-fit=cover/);
    assert.match(dashboard, /<link rel="stylesheet" href="mobile\.css">/);
    assert.match(mobile, /env\(safe-area-inset-top\)/);
    assert.match(mobile, /@media \(max-width: 767px\)/);
});

test("mobile layout keeps core dashboard sections available", () => {
    for (const id of [
        "containerEU1", "containerEU2", "containerEU3", "watchList",
        "activityFeedPanel", "chartParent", "logBox", "telemetryInspector"
    ]) assert.match(dashboard, new RegExp(`id=["']${id}["']`), id);

    assert.match(dashboard, /mobile-server-deck/);
    assert.match(dashboard, /mobile-roster-toolbar/);
    assert.match(dashboard, /mobile-watch-controls/);
    assert.match(dashboard, /mobile-asset-grid/);
});

test("touch controls expose usable targets and a one-tap squad action", () => {
    assert.match(mobile, /min-height:\s*44px/);
    assert.match(mobile, /touch-action:\s*manipulation/);
    assert.match(mobile, /\.mobile-player-add/);
    assert.match(dashboard, /mobileAdd\.textContent = "ADD"/);
    assert.match(dashboard, /mobileAdd\.setAttribute\("aria-label"/);
    assert.equal((dashboard.match(/type="button" class="wd-switch-btn"/g) || []).length, 9);
});

test("mobile dialogs and reduced-motion preferences are supported", () => {
    assert.match(mobile, /\.activity-feed-inspector/);
    assert.match(mobile, /\.telemetry-inspector-panel/);
    assert.match(mobile, /prefers-reduced-motion:\s*reduce/);
});


test("responsive ranges and charts fit phone, tablet and desktop containers", () => {
    assert.match(dashboard, /min-w-0 lg:w-\[42%\]/);
    assert.match(dashboard, /data-range="7d">7 DAYS/);
    assert.match(mobile, /#assetRangeControls[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(mobile, /\.chart-container[\s\S]*max-width:\s*100%/);
    assert.match(dashboard, /new ResizeObserver\(\(\) => \{ chart\.resize\(\); \}\)/);
});
