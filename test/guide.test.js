const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "dashboard/index.html"), "utf8");
const guideSource = fs.readFileSync(path.join(root, "dashboard/guideContent.js"), "utf8");
const guideScript = fs.readFileSync(path.join(root, "dashboard/guide.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(guideSource, context);
const guide = context.window.STM_GUIDE_CONTENT;

test("dashboard exposes the text guide", () => {
    assert.match(dashboard, /id="guideTrigger"/);
    assert.equal(guide.title, "STM-CORE GUIDE");
    assert.deepEqual(Array.from(guide.sections, section => section.title), [
        "Overview", "Servers and players", "Squads", "Activity and restarts", "Telemetry", "Audio and logs"
    ]);
});

test("guide sections contain concise text only", () => {
    for (const section of guide.sections) {
        assert.match(section.id, /^[a-z-]+$/);
        assert.ok(section.paragraphs.length >= 1);
        assert.ok(section.paragraphs.every(paragraph => typeof paragraph === "string" && paragraph.length > 0));
        assert.deepEqual(Object.keys(section).sort(), ["id", "paragraphs", "title"]);
    }
    assert.doesNotMatch(guideSource, /image|screenshot|callout|lightbox|future|Player Edition/i);
});

test("guide stays local and does not contain private configuration", () => {
    const combined = `${guideSource}\n${guideScript}`;
    assert.doesNotMatch(combined, /https?:\/\//i);
    assert.doesNotMatch(combined, /lex01|(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}|\/home\//i);
    assert.doesNotMatch(combined, /(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*=/i);
    assert.doesNotMatch(combined, /fetch\s*\(/);
});

test("guide preserves dialog and keyboard accessibility", () => {
    assert.match(guideScript, /setAttribute\("role", "dialog"\)/);
    assert.match(guideScript, /setAttribute\("aria-modal", "true"\)/);
    assert.match(guideScript, /setAttribute\("aria-labelledby", "stmGuideTitle"\)/);
    assert.match(guideScript, /setAttribute\("aria-label", "Guide sections"\)/);
    assert.match(guideScript, /event\.key === "Escape"/);
    assert.match(guideScript, /event\.key !== "Tab"/);
    assert.match(guideScript, /opener\?\.focus/);
});
