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

const titles = [
    "QUICK START", "VOICE COMMS", "SERVER PANELS & OPERATORS", "SQUAD TRACKING",
    "ACTIVITY FEED & RESTART LOG", "WATCHDOG: OFF / AUTO / ON", "TELEMETRY HISTORY",
    "OSCILLOSCOPES & TELEMETRY INSPECTOR", "RESTART FLAGS", "ASSET SATURATION",
    "ADMIN ON SERVER & JSOC MARKERS", "CLOCK & MANUAL OVERRIDE",
    "BACKUP, RESTORE & DATABASE", "SYS-LOG & TROUBLESHOOTING"
];

test("legacy Guide and handler are completely removed", () => {
    assert.doesNotMatch(dashboard, /STM OPERATIONAL GUIDE V6\.0|Voice Architect \(TTS Engine\)|12H quarantine|toggleHelp\s*\(/);
    assert.doesNotMatch(dashboard, /id=["']helpModal["']/);
    assert.match(dashboard, /id="guideTrigger"/);
});

test("manual has exactly 14 ordered, complete chapters", () => {
    assert.equal(guide.version, "0.8.14");
    assert.deepEqual(Array.from(guide.chapters, c => c.title), titles);
    guide.chapters.forEach((chapter, index) => {
        assert.equal(chapter.number, String(index + 1).padStart(2, "0"));
        for (const field of ["purpose", "controls", "how", "persistence", "safety", "image", "callouts"])
            assert.ok(chapter[field] && chapter[field].length, `${chapter.title}: ${field}`);
        assert.equal(chapter.callouts.length, new Set(chapter.callouts).size);
    });
});

test("all controlled PNG assets exist with expected signature and dimensions", () => {
    for (const chapter of guide.chapters) {
        const file = path.join(root, "dashboard", chapter.image);
        const png = fs.readFileSync(file);
        assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
        assert.equal(png.readUInt32BE(16), 1200);
        assert.equal(png.readUInt32BE(20), 675);
        assert.ok(png.length > 1000);
    }
});

test("manual is offline and sanitized", () => {
    const combined = `${guideSource}\n${guideScript}`;
    assert.doesNotMatch(combined, /https?:\/\//i);
    assert.doesNotMatch(combined, /lex01|(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}|\/home\//i);
    assert.doesNotMatch(combined, /(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*=/i);
    assert.doesNotMatch(combined, /fetch\s*\(/);
});

test("callout markers and descriptions share the same chapter array", () => {
    assert.match(guideScript, /chapter\.callouts\.forEach/g);
    assert.match(guideScript, /stm-guide-callout-list/);
    assert.match(guideScript, /openLightbox/);
});

test("glossary contains all required terms", () => {
    const terms = Array.from(guide.glossary, row => row[0]);
    for (const term of ["OPR", "AO", "LAT", "APRX", "EXACT TIME UNKNOWN", "UNLINKED", "WATCHDOG", "RESTART CONFIRMED"])
        assert.ok(terms.includes(term), term);
});

test("CAUTION is limited to real state-changing controls", () => {
    const caution = guide.chapters.filter(c => c.safety.startsWith("CAUTION:"));
    assert.deepEqual(Array.from(caution, c => c.id), ["squad-tracking", "activity-feed", "backup-database", "troubleshooting"]);
});
