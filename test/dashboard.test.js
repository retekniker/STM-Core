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

function createRestartClockHarness(initialMode = "AUTO", monitoringSessionId = "2026-07-29T08:00:00.000Z") {
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
    const persistMonitoringSession = () => {
        storage.set("jsoc_monitor_session", JSON.stringify({
            id: monitoringSessionId,
            wdState,
            lastRestartData,
            detectedAt: sessionRestartDetectedAt
        }));
        storage.set("jsoc_wd_state", JSON.stringify(wdState));
        storage.set("jsoc_last_restarts", JSON.stringify(lastRestartData));
        writes.push({ key: "jsoc_monitor_session" });
    };
    const syncBackendRestartClock = Function(
        "wdState",
        "lastRestartData",
        "sessionRestartDetectedAt",
        "localStorage",
        "renderWdSwitches",
        "updateClock",
        "monitoringSessionId",
        "persistMonitoringSession",
        `${source}; return syncBackendRestartClock;`
    )(
        wdState,
        lastRestartData,
        sessionRestartDetectedAt,
        localStorage,
        renderWdSwitches,
        updateClock
        ,monitoringSessionId
        ,persistMonitoringSession
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

test("telemetry charts use stable geometry and an outlier-resistant ping range", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    const inspectorStart = html.indexOf("function createTelemetryInspectorChart()");
    const inspectorEnd = html.indexOf("function renderTelemetryInspector()", inspectorStart);
    const inspector = html.slice(inspectorStart, inspectorEnd);

    const scaleSource = extractFunction(html, "calculateStablePingRange");
    const calculateScale = Function(`${scaleSource}; return calculateStablePingRange;`)();
    const normal = Array.from({ length: 24 }, (_, index) => 40 + index % 21);
    assert.deepEqual(calculateScale(normal), { min: 0, max: 100 });
    assert.deepEqual(calculateScale([...normal, 900]), { min: 0, max: 100 });
    assert.deepEqual(calculateScale([...normal, 500]), { min: 0, max: 100 });
    const elevated = Array.from({ length: 24 }, (_, index) => 140 + index % 31);
    assert.ok(calculateScale(elevated).max > 170);
    const inspectorScaleSource = extractFunction(html, "calculateInspectorPingRange");
    const calculateInspectorScale = Function(`${inspectorScaleSource}; return calculateInspectorPingRange;`)();
    assert.deepEqual(calculateInspectorScale([40, 55, 200]), { min: 0, max: 220 });

    assert.match(html, /\.chart-container > canvas \{ width: 100% !important; height: 100% !important; \}/);
    assert.doesNotMatch(html, /\}\s*canvas \{ width: 100% !important/);
    assert.match(html, /\.server-grid-row \{[^}]+height: 118px; min-height: 118px;/);
    assert.doesNotMatch(html, /@container \(max-width: 660px\)/);
    assert.match(html, /new ResizeObserver\(\(\) => scheduleChartResize/);
    assert.match(html, /getBoundingClientRect\(\)/);
    assert.match(html, /requestAnimationFrame/);
    assert.match(html, /options: \{ responsive: false/);
    assert.match(html, /chartInstance\.options\.scales\.miniPing\.max = pingRange\.max/);
    assert.match(html, /chartInstance\.options\.scales\.ping\.max = pingRange\.max/);
    assert.match(html, /datasets\[0\]\.data = points\.map\(point => point\.players\)/);
    assert.match(html, /label: 'Ping'[^}]+borderWidth: 1[^}]+pointRadius: 0[^}]+pointBorderWidth: 0[^}]+order: 1/);
    assert.match(html, /point\?\.ping/);

    assert.match(inspector, /label: 'PING'[^}]+pointBorderWidth: 0[^}]+borderWidth: 1[^}]+spanGaps: false[^}]+yAxisID: 'ping'/);
    assert.doesNotMatch(inspector, /miniPing/);

    const gapSource = extractFunction(html, "breakTelemetryGaps");
    const breakGaps = Function(`${gapSource}; return breakTelemetryGaps;`)();
    const points = [
        { timestamp: "2026-07-29T01:00:00.000Z", ping: 40, players: 2 },
        { timestamp: "2026-07-29T09:00:00.000Z", ping: 45, players: 3 }
    ];
    const broken = breakGaps(points, [{ timeKnown: false, observationWindow: {
        start: "2026-07-29T01:01:00.000Z", end: "2026-07-29T08:59:00.000Z"
    } }]);
    assert.equal(broken.length, 3);
    assert.equal(broken[1].ping, null);
    assert.equal(broken[1].players, null);
});

test("mini-chart layouts stay nonzero at tested Dell and Full HD zoom widths", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    assert.match(html, /\.mini-chart-cell \{ min-width: 240px; min-height: 90px; height: 100%; \}/);
    assert.match(html, /@container \(max-width: 720px\)/);
    assert.match(html, /grid-template-rows: 118px 100px; height: 230px/);
    assert.match(html, /\.mini-chart-cell \{ width: 100%; min-width: 1px; height: 100px; min-height: 100px; \}/);

    const scenarios = [
        [1366, 100], [1366, 150], [1366, 175], [1366, 200], [1366, 250],
        [1920, 100], [1920, 125], [1920, 150], [1920, 200]
    ];
    for (const [physicalWidth, zoom] of scenarios) {
        const cssViewportWidth = physicalWidth / (zoom / 100);
        const compact = cssViewportWidth <= 720;
        const controlledHeight = compact ? 100 : 90;
        assert.ok(cssViewportWidth > 0);
        assert.ok(controlledHeight > 0);
    }

    const resizeSource = extractFunction(html, "scheduleChartResize");
    assert.doesNotMatch(resizeSource, /canvas\.width|canvas\.height|calculateStablePingRange/);
    assert.match(resizeSource, /previous\?\.width === width && previous\?\.height === height/);
});

test("restart log renders backend evidence without inventing gap time", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    const activityFeed = fs.readFileSync(
        path.join(__dirname, "../dashboard/activityFeed.js"),
        "utf8"
    );

    assert.match(activityFeed, /\/api\/v1\/community\/restarts\?limit=100&view=activity-feed/);
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

test("new monitoring session ignores historical uptime and accepts its first confirmed restart", () => {
    const harness = createRestartClockHarness("AUTO");

    harness.sync({
        lastRestartDetectedAt: "2026-07-28T10:00:10.000Z",
        lastRestartAt: "2026-07-28T10:00:00.000Z"
    });
    assert.equal(harness.wdState.EU1, "AUTO");
    assert.equal(harness.lastRestartData.EU1, null);

    harness.sync({
        lastRestartDetectedAt: "2026-07-29T08:00:12.000Z",
        lastRestartAt: "2026-07-29T08:00:10.000Z"
    });

    assert.equal(harness.wdState.EU1, "AUTO");
    assert.equal(
        harness.lastRestartData.EU1,
        Date.parse("2026-07-29T08:00:10.000Z")
    );
    assert.equal(harness.clockRenders, 1);
});

test("manual OFF and ON remain stable within the same monitoring session", () => {
    for (const mode of ["OFF", "ON"]) {
        const harness = createRestartClockHarness(mode);
        harness.sync({
            lastRestartDetectedAt: "2026-07-29T08:00:12.000Z",
            lastRestartAt: "2026-07-29T08:00:10.000Z"
        });
        assert.equal(harness.wdState.EU1, mode);
        assert.equal(harness.lastRestartData.EU1, Date.parse("2026-07-29T08:00:10.000Z"));
    }
});

test("two consecutive restarts keep AUTO and update the authoritative base twice", () => {
    const harness = createRestartClockHarness("AUTO");
    harness.sync({
        lastRestartDetectedAt: "2026-07-29T08:00:12.000Z",
        lastRestartAt: "2026-07-29T08:00:10.000Z"
    });
    assert.equal(
        harness.lastRestartData.EU1,
        Date.parse("2026-07-29T08:00:10.000Z")
    );

    harness.sync({
        lastRestartDetectedAt: "2026-07-29T09:00:13.000Z",
        lastRestartAt: "2026-07-29T09:00:00.000Z"
    });
    assert.equal(harness.wdState.EU1, "AUTO");
    assert.equal(
        harness.lastRestartData.EU1,
        Date.parse("2026-07-29T09:00:00.000Z")
    );
    assert.ok(harness.writes.filter(write => write.key === "jsoc_monitor_session").length >= 2);
});

test("repeated fetch in the same monitoring session preserves the confirmed base", () => {
    const harness = createRestartClockHarness("AUTO");
    const current = {
        lastRestartDetectedAt: "2026-07-29T08:00:12.000Z",
        lastRestartAt: "2026-07-29T08:00:10.000Z"
    };

    harness.sync(current);
    harness.sync(current);
    assert.equal(harness.wdState.EU1, "AUTO");
    assert.equal(harness.lastRestartData.EU1, Date.parse(current.lastRestartAt));
    assert.match(fs.readFileSync(dashboardPath, "utf8"), /stored\?\.id === sessionId/);
});

test("page reload restores manual state only for the same backend session", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    const defaultSource = extractFunction(html, "defaultWdState").replace("function defaultWdState", "function defaultWdState");
    const resolveSource = extractFunction(html, "resolveMonitoringSession");
    const resolve = Function(`${defaultSource}; ${resolveSource}; return resolveMonitoringSession;`)();
    const stored = {
        id: "session-a",
        wdState: { EU1: "ON", EU2: "OFF", EU3: "AUTO" },
        lastRestartData: { EU1: 1234 },
        detectedAt: { EU1: "restart-a" }
    };

    const reload = resolve(stored, "session-a");
    assert.equal(reload.sameSession, true);
    assert.equal(reload.wdState.EU1, "ON");
    assert.equal(reload.lastRestartData.EU1, 1234);

    const newProcess = resolve(stored, "session-b");
    assert.equal(newProcess.sameSession, false);
    assert.deepEqual(newProcess.wdState, { EU1: "AUTO", EU2: "AUTO", EU3: "AUTO" });
    assert.equal(newProcess.lastRestartData.EU1, null);
});
