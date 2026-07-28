const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(
    __dirname,
    "../dashboard/index.html"
);

function getInlineScripts(html) {
    return Array.from(
        html.matchAll(
            /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi
        ),
        match => match[1]
    );
}

test("dashboard inline scripts have valid JavaScript syntax", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    for (const script of getInlineScripts(html)) {
        Function(script);
    }
});

test("dashboard delegates restart confirmation to the backend", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    for (const legacyName of [
        "prevSteamId",
        "prevUptime",
        "RESTART_DETECTION_COOLDOWN_MS",
        "recordRestartPattern",
        "predictNextRestartWindow",
        "forceEmptyRosterThisCycle"
    ]) {
        assert.equal(
            html.includes(legacyName),
            false,
            `${legacyName} should not remain in the dashboard`
        );
    }

    for (const backendField of [
        "lastRestartAt",
        "lastRestartDetectedAt",
        "lastRestartReason",
        "uptimeSinceRestartSeconds",
        "restartDetectionStatus",
        "restartCandidateSteamId",
        "restartCandidateSince",
        "restartPrediction"
    ]) {
        assert.equal(
            html.includes(backendField),
            true,
            `${backendField} should be cached by the dashboard`
        );
    }
});

test("dashboard retains A2S player connection time and CRLF layout", () => {
    const contents = fs.readFileSync(dashboardPath);
    const html = contents.toString("utf8");
    const crlfCount = (html.match(/\r\n/g) || []).length;
    const loneLfCount = (html.match(/(?<!\r)\n/g) || []).length;

    assert.match(html, /time:\s*Number\.isFinite\(Number\(player\.time\)\)/);
    assert.match(html, /formatPlayerConnectionTime\(p\.time\)/);
    assert.ok(crlfCount > loneLfCount * 20);
});

test("dashboard oscilloscope uses SQLite telemetry ranges and markers", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    for (const range of ["30m", "2h", "6h", "12h"]) {
        assert.match(
            html,
            new RegExp(`data-range="${range}"`)
        );
    }

    assert.match(
        html,
        /\/api\/v1\/community\/telemetry\?range=/
    );
    assert.match(html, /telemetryMarkerPlugin/);
    assert.equal(html.includes("pingHistory"), false);
    assert.equal(html.includes("playerHistory"), false);
});
