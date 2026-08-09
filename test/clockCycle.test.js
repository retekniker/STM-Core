const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    CLOCK_PHASE_MS,
    nextClockMode,
    formatRestartPrediction,
    getPredictionClockFrame
} = require("../dashboard/clockCycle");

test("server clock cycles elapsed, restart time and Restart Prediction", () => {
    assert.equal(nextClockMode("elapsed"), "restartTime");
    assert.equal(nextClockMode("restartTime"), "prediction");
    assert.equal(nextClockMode("prediction"), "elapsed");
    assert.equal(nextClockMode("unknown"), "elapsed");
});

test("prediction mode shows the clock before the DMD-style prediction", () => {
    const activatedAt = Date.parse("2026-08-09T10:00:00.000Z");
    const prediction = {
        status: "PREDICTED",
        predictedAt: "2026-08-09T14:30:00.000Z",
        cycleHours: 24,
        confidence: 0.84
    };
    const clock = getPredictionClockFrame({
        prediction,
        activatedAt,
        nowMs: activatedAt + CLOCK_PHASE_MS - 1,
        formatTime: () => "10:00:03"
    });
    const message = getPredictionClockFrame({
        prediction,
        activatedAt,
        nowMs: activatedAt + CLOCK_PHASE_MS,
        formatDate: () => "09/08/2026, 14:30:00"
    });

    assert.deepEqual(clock, { kind: "clock", text: "10:00:03" });
    assert.equal(message.kind, "prediction");
    assert.match(message.text, /RESTART PREDICTION/);
    assert.match(message.text, /09\/08\/2026, 14:30:00/);
    assert.match(message.text, /24H CYCLE/);
    assert.match(message.text, /84% CONFIDENCE/);
    assert.doesNotMatch(message.text, /COUNTDOWN|T-/);
});

test("dashboard wires the third clock state and DMD marquee", () => {
    const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    assert.match(dashboard, /nextClockMode\(clockMode\[server\]\)/);
    assert.match(dashboard, /getPredictionClockFrame/);
    assert.match(dashboard, /clock-prediction-message/);
    assert.match(dashboard, /DMD RESTART PREDICTION/);
    assert.match(formatRestartPrediction({ status: "LEARNING" }), /LEARNING/);
});
