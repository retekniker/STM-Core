(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const CLOCK_MODES = Object.freeze(["elapsed", "restartTime", "prediction"]);

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
        const predictedAt = Date.parse(options.prediction?.predictedAt || "");
        if (!Number.isFinite(predictedAt)) return { kind: "prediction", text: "--:--:--" };
        const date = new Date(predictedAt);
        const text = typeof options.formatTime === "function"
            ? options.formatTime(date)
            : date.toLocaleTimeString("en-GB", { hour12: false });
        return { kind: "prediction", text };
    }

    function formatRestartPredictionDmd(serverId, prediction, formatDate) {
        const status = String(prediction?.status || "AWAITING_BACKEND_MODEL").toUpperCase();
        if (status !== "PREDICTED" || !Number.isFinite(Date.parse(prediction?.predictedAt))) {
            return `${serverId} // RESTART PREDICTION // ${status.replaceAll("_", " ")}`;
        }

        const format = value => typeof formatDate === "function"
            ? formatDate(new Date(value))
            : new Date(value).toLocaleString("en-GB", { hour12: false });
        const cycle = Number.isFinite(Number(prediction.cycleHours))
            ? `${Number(prediction.cycleHours)}H CYCLE`
            : "CYCLE LEARNING";
        const confidence = Number.isFinite(Number(prediction.confidence))
            ? `${Math.round(Number(prediction.confidence) * 100)}% CONFIDENCE`
            : "CONFIDENCE LEARNING";
        const windowStart = Date.parse(prediction.predictedWindowStart || "");
        const windowEnd = Date.parse(prediction.predictedWindowEnd || "");
        const windowText = Number.isFinite(windowStart) && Number.isFinite(windowEnd)
            ? `WINDOW ${format(windowStart)} - ${format(windowEnd)}`
            : "WINDOW UNAVAILABLE";
        return `${serverId} // RESTART PREDICTION // ${format(prediction.predictedAt)} // ${cycle} // ${confidence} // ${windowText}`;
    }

    return {
        CLOCK_MODES,
        nextClockMode,
        formatRestartPrediction,
        getPredictionClockFrame,
        formatRestartPredictionDmd
    };
});
