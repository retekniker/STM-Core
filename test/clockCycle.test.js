const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    nextClockMode,
    formatRestartPrediction,
    getPredictionClockFrame,
    formatRestartPredictionDmd
} = require("../dashboard/clockCycle");

test("server clock cycles elapsed, restart time and Restart Prediction", () => {
    assert.equal(nextClockMode("elapsed"), "restartTime");
    assert.equal(nextClockMode("restartTime"), "prediction");
    assert.equal(nextClockMode("prediction"), "elapsed");
    assert.equal(nextClockMode("unknown"), "elapsed");
});

test("prediction mode always shows the predicted restart time", () => {
    const prediction = {
        status: "PREDICTED",
        predictedAt: "2026-08-09T14:30:00.000Z",
        cycleHours: 24,
        confidence: 0.84
    };
    const clock = getPredictionClockFrame({
        prediction,
        formatTime: () => "14:30:00"
    });

    assert.deepEqual(clock, { kind: "prediction", text: "14:30:00" });
});

test("DMD prediction formatter preserves supplied prediction details", () => {
    const prediction = {
        status: "PREDICTED",
        predictedAt: "2026-08-09T14:30:00.000Z",
        predictedWindowStart: "2026-08-09T14:00:00.000Z",
        predictedWindowEnd: "2026-08-09T15:00:00.000Z",
        cycleHours: 24,
        confidence: 0.84
    };
    const text = formatRestartPredictionDmd("EU1", prediction, date => date.toISOString());
    assert.match(text, /EU1 \/\/ RESTART PREDICTION/);
    assert.match(text, /24H CYCLE/);
    assert.match(text, /84% CONFIDENCE/);
    assert.match(text, /WINDOW 2026-08-09T14:00:00.000Z - 2026-08-09T15:00:00.000Z/);
});

test("dashboard wires the third clock state and prediction DMD renderer", () => {
    const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    assert.match(dashboard, /nextClockMode\(clockMode\[server\]\)/);
    assert.match(dashboard, /getPredictionClockFrame/);
    assert.match(dashboard, /formatRestartPredictionDmd/);
    assert.match(dashboard, /renderPredictionDmd/);
    assert.match(dashboard, /if \(!dmdAlertController\.active\) renderPredictionDmd\(\)/);
    assert.doesNotMatch(dashboard, /pushToDMD\(server \+ ' \/\/ ' \+ formatRestartPrediction/);
    assert.doesNotMatch(dashboard, /PREDICTED NEXT RESTART/);
    assert.match(formatRestartPrediction({ status: "LEARNING" }), /LEARNING/);
});
