(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const CLOCK_MODES = Object.freeze(["elapsed", "restartTime", "prediction"]);
    const CLOCK_PHASE_MS = 4000;
    const PREDICTION_PHASE_MS = 12000;

    function nextClockMode(mode) {
        const index = CLOCK_MODES.indexOf(mode);
        return CLOCK_MODES[(index + 1 + CLOCK_MODES.length) % CLOCK_MODES.length];
    }

    function formatRestartPrediction(prediction, formatDate) {
        const status = String(prediction?.status || "AWAITING_BACKEND_MODEL").toUpperCase();
        if (status !== "PREDICTED" || !Number.isFinite(Date.parse(prediction?.predictedAt))) {
            return `RESTART PREDICTION // ${status.replaceAll("_", " ")}`;
        }

        const dateText = typeof formatDate === "function"
            ? formatDate(new Date(prediction.predictedAt))
            : new Date(prediction.predictedAt).toLocaleString("en-GB", { hour12: false });
        const cycle = Number.isFinite(Number(prediction.cycleHours))
            ? `${Number(prediction.cycleHours)}H CYCLE`
            : "CYCLE LEARNING";
        const confidence = Number.isFinite(Number(prediction.confidence))
            ? `${Math.round(Number(prediction.confidence) * 100)}% CONFIDENCE`
            : "CONFIDENCE LEARNING";
        return `RESTART PREDICTION // ${dateText} // ${cycle} // ${confidence}`;
    }

    function getPredictionClockFrame(options = {}) {
        const nowMs = Number(options.nowMs);
        const activatedAt = Number(options.activatedAt);
        const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
        const safeActivatedAt = Number.isFinite(activatedAt) ? activatedAt : safeNow;
        const cycleMs = CLOCK_PHASE_MS + PREDICTION_PHASE_MS;
        const elapsed = Math.max(0, safeNow - safeActivatedAt) % cycleMs;

        if (elapsed < CLOCK_PHASE_MS) {
            const date = new Date(safeNow);
            const text = typeof options.formatTime === "function"
                ? options.formatTime(date)
                : date.toLocaleTimeString("en-GB", { hour12: false });
            return { kind: "clock", text };
        }

        return {
            kind: "prediction",
            text: formatRestartPrediction(options.prediction, options.formatDate)
        };
    }

    return {
        CLOCK_MODES,
        CLOCK_PHASE_MS,
        PREDICTION_PHASE_MS,
        nextClockMode,
        formatRestartPrediction,
        getPredictionClockFrame
    };
});
