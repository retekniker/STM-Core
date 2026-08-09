const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "dashboard/index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "dashboard/manifest.webmanifest"), "utf8"));
const registration = fs.readFileSync(path.join(root, "dashboard/pwa.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "dashboard/service-worker.js"), "utf8");
const offline = fs.readFileSync(path.join(root, "dashboard/offline.html"), "utf8");

test("dashboard declares an installable PWA", () => {
    assert.match(dashboard, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(dashboard, /rel="apple-touch-icon"/);
    assert.match(dashboard, /<script src="pwa\.js"><\/script>/);
    assert.equal(manifest.name, "STM Core");
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.prefer_related_applications, false);
});

test("manifest provides valid Android icon sizes", () => {
    assert.deepEqual(manifest.icons.map(icon => icon.sizes), ["192x192", "512x512"]);
    for (const icon of manifest.icons) {
        const file = path.join(root, "dashboard", icon.src);
        const png = fs.readFileSync(file);
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        const expected = Number(icon.sizes.split("x")[0]);
        assert.equal(png.readUInt32BE(16), expected);
        assert.equal(png.readUInt32BE(20), expected);
    }
});

test("service worker registers only in a secure context", () => {
    assert.match(registration, /window\.isSecureContext/);
    assert.match(registration, /serviceWorker\.register\("service-worker\.js"/);
});

test("offline mode never substitutes cached telemetry for live backend data", () => {
    assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
    assert.match(worker, /url\.pathname === "\/ws"/);
    const precache = worker.match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
    assert.doesNotMatch(precache, /api\//);
    assert.match(offline, /No cached telemetry is shown as current data/);
});
