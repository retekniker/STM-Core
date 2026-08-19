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

test("dashboard routes connection transitions through the DMD alert gate", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    assert.match(html, /const connectionAlertGate = new ConnectionAlertGate\(\)/);
    assert.match(html, /handleConnectionAlert\(name, finalStatus, lat\)/);
    assert.match(html, /handleConnectionAlert\(name, 'offline', 0\)/);
    assert.match(html, /source: 'connectivity'/);
});

test("server panels emphasize map names and classify latency with DMD thresholds", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");

    for (const server of ["EU1", "EU2", "EU3"]) {
        assert.match(html, new RegExp(`id="map${server}"[^>]+server-map-name server-map-${server.toLowerCase()}`));
        assert.match(html, new RegExp(`id="ping${server}"[^>]+server-ping-value server-ping-normal`));
    }
    assert.match(html, /<div class="opacity-70">OPR:<\/div>/);
    assert.match(html, /server-map-name \{ font-size: 1rem; font-weight: 900;/);
    assert.match(html, /server-ping-value \{ font-size: 1rem; font-weight: 900;/);
    assert.match(html, /CONNECTION_LATENCY_THRESHOLDS\.veryHigh/);
    assert.match(html, /CONNECTION_LATENCY_THRESHOLDS\.high/);

    const source = extractFunction(html, "getLatencyClass");
    const getLatencyClass = Function(
        "CONNECTION_LATENCY_THRESHOLDS",
        `${source}; return getLatencyClass;`
    )({ high: 200, veryHigh: 400 });
    assert.equal(getLatencyClass("online", 200), "server-ping-normal");
    assert.equal(getLatencyClass("online", 201), "server-ping-high");
    assert.equal(getLatencyClass("online", 400), "server-ping-high");
    assert.equal(getLatencyClass("online", 401), "server-ping-very-high");
    assert.equal(getLatencyClass("offline", 20), "server-ping-offline");
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

    assert.match(activityFeed, /\/api\/v1\/community\/restarts\?limit=100/);
    assert.doesNotMatch(activityFeed, /view=activity-feed/);
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

test("0.8.19 roster and Asset Saturation controls expose the requested defaults", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    assert.match(html, /SORT: ONLINE/);
    assert.match(html, /function readSortMode\(storage = localStorage\)/);
    assert.match(html, /function persistSortMode\(storage, mode\)/);
    assert.match(html, /selectedRosterPlayers = new Set/);
    assert.match(html, /event\.ctrlKey \|\| event\.metaKey/);
    assert.match(html, /let assetSaturationMetric = "TOTAL"/);
    assert.match(html, /serverSamples\?\.\[assetSaturationMetric\]/);
    assert.match(html, /asset-saturation-selected/);
    assert.match(html, /totalPlayers \+ " — " \+/);
});

test("SquadRoster sort preference defaults safely and persists only valid modes", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    assert.match(html, /sortMode === 'ONLINE' \? 'ALPHABETICAL' : 'ONLINE'/);
    assert.doesNotMatch(html, /SORT: ADDED|sortMode === 'ADDED'|sortMode === 'A-Z'/);
    assert.doesNotMatch(html, /Draft Unlinked|DRAFT UNLINKED|draftUnlinked|draft-unlinked/i);

    const readSource = extractFunction(html, "readSortMode");
    const readSortMode = Function("SORT_MODE_KEY", `${readSource}; return readSortMode;`)("jsoc_sort_mode");
    const storage = value => ({ getItem: () => value });
    assert.equal(readSortMode(storage(null)), "ONLINE");
    assert.equal(readSortMode(storage("ALPHABETICAL")), "ALPHABETICAL");
    assert.equal(readSortMode(storage("ADDED")), "ONLINE");
    assert.equal(readSortMode({ getItem() { throw new Error("corrupt storage"); } }), "ONLINE");

    const persistSource = extractFunction(html, "persistSortMode");
    const persistSortMode = Function("SORT_MODE_KEY", `${persistSource}; return persistSortMode;`)("jsoc_sort_mode");
    const writes = [];
    const writable = { setItem: (key, value) => writes.push([key, value]) };
    assert.equal(persistSortMode(writable, "ALPHABETICAL"), "ALPHABETICAL");
    assert.equal(persistSortMode(writable, "invalid"), "ONLINE");
    assert.deepEqual(writes, [["jsoc_sort_mode", "ALPHABETICAL"], ["jsoc_sort_mode", "ONLINE"]]);
});

test("SquadRoster supports single select, CTRL toggles, touch selection and duplicate-safe bulk add", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    assert.match(html, /function updateRosterSelection\(selection, name, multiSelect\)/);
    assert.match(html, /event\.ctrlKey \|\| event\.metaKey \|\| coarsePointer/);
    assert.match(html, /function planRosterAdds\(selected, allSquads, squadIndex, maximum\)/);
    assert.match(html, /const additions = planRosterAdds\(Array\.from\(selectedRosterPlayers\)/);
    assert.match(html, /roster-player-selected/);

    const selectSource = extractFunction(html, "updateRosterSelection");
    const updateRosterSelection = Function(`${selectSource}; return updateRosterSelection;`)();
    assert.deepEqual([...updateRosterSelection(new Set(), "Alpha", false)], ["Alpha"]);
    assert.deepEqual([...updateRosterSelection(new Set(["Alpha"]), "Bravo", true)], ["Alpha", "Bravo"]);
    assert.deepEqual([...updateRosterSelection(new Set(["Alpha", "Bravo"]), "Alpha", true)], ["Bravo"]);
    assert.deepEqual([...updateRosterSelection(new Set(["Alpha", "Bravo"]), "Charlie", false)], ["Charlie"]);

    const planSource = extractFunction(html, "planRosterAdds");
    const planRosterAdds = Function(`${planSource}; return planRosterAdds;`)();
    const squads = { 1: ["Existing"], 2: [], 3: [] };
    assert.deepEqual(planRosterAdds(["Existing", "Alpha", "alpha", "Bravo"], squads, 2, 11), ["Alpha", "Bravo"]);
    assert.deepEqual(planRosterAdds(["Alpha", "Bravo"], squads, 1, 2), ["Alpha"]);
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

test("v0.8.17 header, SYS-LOG and operator export expose only honest controls", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    for (const legacy of ["radar-btn-eco", "radar-btn-norm", "radar-btn-agr", "setRadarMode(", "btnAutoBackup", "systemBackup(", "restoreUpload", "resetBrowserMemory("])
        assert.doesNotMatch(html, new RegExp(legacy.replace(/[()]/g, "\\$&")));
    assert.doesNotMatch(html, />SYNC<|>RADAR<|>EKO<|>NORM<|>AGR</);
    assert.match(html, /ADV LOG: OFF/);
    assert.match(html, /COPY LOG/);
    assert.match(html, /SAVE LOG/);
    assert.match(html, /id="btnExportOperators"/);
    assert.match(html, /function legacyCopyText/);
    assert.match(html, /\.catch\(error =>/);
    assert.match(html, /messageNode\.textContent = String\(text\)/);
    assert.match(html, /ACTIVE PERSONNEL HISTORY/);
    assert.match(html, /text: 'PLAYERS'/);
    assert.match(html, /Number\.isInteger\(value\) \? value : null/);
});

test("first-start standby visibly arms INIT.COM until the operator clicks it", () => {
    const html = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    const standby = html.indexOf('addSystemAlert("VOICE COMMS STANDBY. CLICK [INIT COMM] TO ACTIVATE."');
    const armed = html.indexOf("armInitCommAttention();", standby);

    assert.ok(standby >= 0);
    assert.ok(armed > standby);
    assert.match(html, /\.btn-system-led\.btn-attention \{ animation: btn-attention-blink 0\.8s steps\(2, end\) infinite; \}/);
    assert.match(html, /button\.classList\.add\('btn-attention'\)/);
    assert.match(html, /btnInit\.classList\.remove\("btn-attention"\)/);
    assert.match(html, /removeByAlertId\("alert-startup-voice"\)/);
});

test("INIT.COM is first-launch only and VOICE-COM state persists across reloads", () => {
    const html = fs.readFileSync(dashboardPath, "utf8");
    assert.match(html, /const VOICE_ACKNOWLEDGED_KEY = 'jsoc_voice_acknowledged'/);
    assert.match(html, /const VOICE_ENABLED_KEY = 'jsoc_voice_enabled'/);
    assert.match(html, /if \(!voiceStartupState\.acknowledged\)/);
    assert.match(html, /localStorage\.setItem\(VOICE_ACKNOWLEDGED_KEY, 'true'\)/);
    assert.match(html, /localStorage\.setItem\(VOICE_ENABLED_KEY, String\(voiceEnabled\)\)/);
    assert.match(html, /btnInit\.innerText = "VOICE: OFF"/);
    assert.doesNotMatch(html, /pageshow[\s\S]{0,120}armInitCommAttention/);
    assert.doesNotMatch(html, /visibilitychange[\s\S]{0,120}armInitCommAttention/);

    const source = extractFunction(html, "readVoiceStartupState");
    const readVoiceStartupState = Function(
        `const VOICE_ACKNOWLEDGED_KEY = 'jsoc_voice_acknowledged'; const VOICE_ENABLED_KEY = 'jsoc_voice_enabled'; ${source}; return readVoiceStartupState;`
    )();
    const storage = new Map([
        ["jsoc_voice_acknowledged", "true"],
        ["jsoc_voice_enabled", "true"]
    ]);
    const state = readVoiceStartupState({
        getItem: key => storage.get(key) || null
    });
    assert.deepEqual(state, { acknowledged: true, enabled: true });
});
