const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
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

test("dashboard wires the third clock state and DMD marquee", () => {
    const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    assert.match(dashboard, /nextClockMode\(clockMode\[server\]\)/);
    assert.match(dashboard, /getPredictionClockFrame/);
    assert.match(dashboard, /pushToDMD\(server \+ ' \/\/ ' \+ formatRestartPrediction\(prediction\), 'warning'/);
    assert.match(dashboard, /PREDICTED NEXT RESTART/);
    assert.match(formatRestartPrediction({ status: "LEARNING" }), /LEARNING/);
});
