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

function extractFunction(html, functionName) {
    const start = html.indexOf(`function ${functionName}(`);
    assert.notEqual(start, -1, `${functionName} should exist`);

    const bodyStart = html.indexOf("{", start);
    let depth = 0;

    for (let index = bodyStart; index < html.length; index += 1) {
        if (html[index] === "{") depth += 1;
        if (html[index] === "}") depth -= 1;
        if (depth === 0) return html.slice(start, index + 1);
    }

    throw new Error(`Could not extract ${functionName}`);
}

function createRestartClockHarness(initialMode = "AUTO") {
    const html = fs.readFileSync(dashboardPath, "utf8");
    const source = extractFunction(html, "syncBackendRestartClock");
    const wdState = { EU1: initialMode, EU2: "AUTO", EU3: "AUTO" };
    const lastRestartData = { EU1: null, EU2: null, EU3: null };
    const sessionRestartDetectedAt = { EU1: null, EU2: null, EU3: null };
    const storage = new Map([["jsoc_wd_state", JSON.stringify(wdState)]]);
    const writes = [];
    let activeButton = initialMode;
    let clockRenders = 0;

    const localStorage = {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, value);
            writes.push({ key, value });
        }
    };
    const renderWdSwitches = () => {
        activeButton = wdState.EU1;
    };
    const updateClock = () => {
        clockRenders += 1;
    };
    const syncBackendRestartClock = Function(
        "wdState",
        "lastRestartData",
        "sessionRestartDetectedAt",
        "localStorage",
        "renderWdSwitches",
        "updateClock",
        `${source}; return syncBackendRestartClock;`
    )(
        wdState,
        lastRestartData,
        sessionRestartDetectedAt,
        localStorage,
        renderWdSwitches,
        updateClock
    );

    return {
        sync: core => syncBackendRestartClock("EU1", core),
        wdState,
        lastRestartData,
        sessionRestartDetectedAt,
        storage,
        writes,
        get activeButton() { return activeButton; },
        get clockRenders() { return clockRenders; }
    };
}

test("dashboard inline scripts have valid JavaScript syntax", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    for (const script of getInlineScripts(html)) {
        Function(script);
    }
});

test("dashboard loads the pinned local Chart.js asset without a CDN", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    const chartPath = path.join(
        __dirname,
        "../dashboard/vendor/chart.js/chart.umd.min.js"
    );
    const licensePath = path.join(
        __dirname,
        "../dashboard/vendor/chart.js/LICENSE.md"
    );

    assert.match(html, /src="vendor\/chart\.js\/chart\.umd\.min\.js"/);
    assert.equal(/cdn[^"']*chart\.js/i.test(html), false);
    assert.equal(fs.existsSync(chartPath), true);
    assert.equal(fs.existsSync(licensePath), true);
    assert.match(fs.readFileSync(chartPath, "utf8"), /Chart\.js v4\.5\.1/);
    assert.match(fs.readFileSync(licensePath, "utf8"), /MIT License/);
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

test("restart log renders backend evidence without inventing gap time", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    assert.match(html, /\/api\/v1\/community\/restarts\?limit=100/);
    assert.match(html, /RESTART OCCURRED BETWEEN/);
    assert.match(html, /EXACT TIME UNKNOWN/);
    assert.match(html, /REJECTED TRANSITIONAL STEAM IDS/);
    assert.match(html, /PLAYER SESSION RESET/);
    assert.match(html, /ADDITIONAL \/ OUTLIER/);
    assert.match(html, /EVIDENCE SCORE:/);
    assert.match(html, /score\.breakdown/);
    assert.equal(
        html.includes("eventData.restartAt ||"),
        false
    );
});

test("dashboard exposes backend status and prediction presentations", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    for (const status of [
        "ONLINE",
        "DEGRADED",
        "VERIFYING",
        "RESTART_CONFIRMED"
    ]) {
        assert.equal(
            html.includes(status),
            true,
            `${status} presentation should remain available`
        );
    }

    assert.match(html, /marker\.kind === 'prediction'/);
    assert.match(html, /telemetry\.restarts/);
    assert.equal(/const\s+CYCLE\s*=/.test(html), false);
    assert.equal(
        /(?<!\d)8\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(html),
        false
    );
});

test("AUTO changes to ON only for a restart received after the session baseline", () => {
    const harness = createRestartClockHarness("AUTO");

    harness.sync({
        lastRestartDetectedAt: "2026-07-28T10:00:10.000Z",
        lastRestartAt: "2026-07-28T10:00:00.000Z"
    });
    assert.equal(harness.wdState.EU1, "AUTO");

    harness.sync({
        lastRestartDetectedAt: "2026-07-28T18:00:12.000Z",
        lastRestartAt: "2026-07-28T18:00:00.000Z"
    });

    assert.equal(harness.wdState.EU1, "ON");
    assert.equal(harness.activeButton, "ON");
    assert.equal(
        JSON.parse(harness.storage.get("jsoc_wd_state")).EU1,
        "ON"
    );
    assert.equal(
        harness.lastRestartData.EU1,
        Date.parse("2026-07-28T18:00:00.000Z")
    );
    assert.equal(harness.clockRenders, 1);
});

test("OFF and ON modes remain stable when a new restart arrives", () => {
    for (const mode of ["OFF", "ON"]) {
        const harness = createRestartClockHarness(mode);
        harness.sync({
            lastRestartDetectedAt: "2026-07-28T10:00:10.000Z",
            lastRestartAt: "2026-07-28T10:00:00.000Z"
        });
        harness.sync({
            lastRestartDetectedAt: "2026-07-28T18:00:12.000Z",
            lastRestartAt: "2026-07-28T18:00:00.000Z"
        });

        assert.equal(harness.wdState.EU1, mode);
        assert.equal(
            harness.lastRestartData.EU1,
            Date.parse("2026-07-28T18:00:00.000Z")
        );
    }
});

test("two consecutive restarts keep the clock ON and update its base twice", () => {
    const harness = createRestartClockHarness("AUTO");
    harness.sync({
        lastRestartDetectedAt: "2026-07-28T10:00:10.000Z",
        lastRestartAt: "2026-07-28T10:00:00.000Z"
    });

    harness.sync({
        lastRestartDetectedAt: "2026-07-28T18:00:12.000Z",
        lastRestartAt: "2026-07-28T18:00:00.000Z"
    });
    assert.equal(
        harness.lastRestartData.EU1,
        Date.parse("2026-07-28T18:00:00.000Z")
    );

    harness.sync({
        lastRestartDetectedAt: "2026-07-29T02:00:13.000Z",
        lastRestartAt: "2026-07-29T02:00:00.000Z"
    });
    assert.equal(harness.wdState.EU1, "ON");
    assert.equal(
        harness.lastRestartData.EU1,
        Date.parse("2026-07-29T02:00:00.000Z")
    );
    assert.equal(
        harness.writes.filter(write => write.key === "jsoc_last_restarts").length,
        3
    );
});

test("repeated fetch and page refresh cannot restore AUTO after automatic ON", () => {
    const harness = createRestartClockHarness("AUTO");
    const historical = {
        lastRestartDetectedAt: "2026-07-28T10:00:10.000Z",
        lastRestartAt: "2026-07-28T10:00:00.000Z"
    };
    const current = {
        lastRestartDetectedAt: "2026-07-28T18:00:12.000Z",
        lastRestartAt: "2026-07-28T18:00:00.000Z"
    };

    harness.sync(historical);
    harness.sync(current);
    harness.sync(current);
    assert.equal(harness.wdState.EU1, "ON");

    const persistedMode = JSON.parse(
        harness.storage.get("jsoc_wd_state")
    ).EU1;
    const refreshed = createRestartClockHarness(persistedMode);
    refreshed.sync(current);

    assert.equal(refreshed.wdState.EU1, "ON");
    assert.equal(refreshed.activeButton, "ON");
});
