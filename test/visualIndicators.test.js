const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("essential JSOC and voice indicators remain animated with reduced motion enabled", () => {
    const mobileCss = fs.readFileSync(path.join(__dirname, "../dashboard/mobile.css"), "utf8");
    const reducedMotion = mobileCss.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);

    assert.ok(reducedMotion);
    assert.doesNotMatch(reducedMotion[1], /\.btn-attention/);
    assert.doesNotMatch(reducedMotion[1], /\.clan-member \.player-name/);
});

test("DMD loads its displayed version from the server health endpoint", () => {
    const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");

    assert.match(dashboard, /function refreshDmdVersion\(\)/);
    assert.match(dashboard, /fetch\('\/api\/v1\/community\/health', \{ cache: 'no-store' \}\)/);
    assert.match(dashboard, /createDmdDefaultText\(version\)/);
    assert.doesNotMatch(dashboard, /const DMD_DEFAULT_TEXT/);
});
