(function(root, factory) {
    const exported = factory();
    if (typeof module === "object" && module.exports) module.exports = exported;
    if (root) root.WatchdogStartupHydration = exported;
})(typeof window !== "undefined" ? window : globalThis, function() {
    const MAX_RESTART_AGE_MS = 8 * 60 * 60 * 1000;

    function exactRestartTime(event) {
        if (!event || event.type !== "SERVER_RESTART" || event.data?.timeKnown === false) return null;
        const timestamp = Date.parse(event.data?.restartAt || "");
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function decide(events, nowMs) {
        const restartAt = (events || [])
            .map(exactRestartTime)
            .filter(Number.isFinite)
            .reduce((latest, timestamp) => Math.max(latest, timestamp), -Infinity);
        const ageMs = nowMs - restartAt;
        const usable = Number.isFinite(restartAt) && ageMs >= 0 && ageMs < MAX_RESTART_AGE_MS;
        return { mode: usable ? "ON" : "AUTO", restartAt: usable ? restartAt : null, ageMs: usable ? ageMs : null };
    }

    class Coordinator {
        constructor(options) {
            this.fetchRestarts = options.fetchRestarts;
            this.now = options.now || Date.now;
            this.getManualRevision = options.getManualRevision;
            this.getCurrentRestartAt = options.getCurrentRestartAt;
            this.apply = options.apply;
            this.complete = options.complete || (() => {});
            this.attempted = new Set();
        }

        async hydrate(sessionId, serverId) {
            const key = `${sessionId}:${serverId}`;
            if (this.attempted.has(key)) return { skipped: true };
            this.attempted.add(key);
            const manualRevision = this.getManualRevision(serverId);
            let result;
            try {
                const events = await this.fetchRestarts(serverId);
                result = decide(events, this.now());
            } catch (error) {
                result = { mode: "AUTO", restartAt: null, ageMs: null, error };
            }

            const currentValue = this.getCurrentRestartAt(serverId);
            const currentRestartAt = currentValue === null || currentValue === undefined || currentValue === ""
                ? NaN
                : Number(currentValue);
            if (Number.isFinite(currentRestartAt) && currentRestartAt > (result.restartAt ?? -Infinity)) {
                const currentAge = this.now() - currentRestartAt;
                result = currentAge >= 0 && currentAge < MAX_RESTART_AGE_MS
                    ? { mode: "ON", restartAt: currentRestartAt, ageMs: currentAge }
                    : { mode: "AUTO", restartAt: null, ageMs: null };
            }

            const manualChanged = this.getManualRevision(serverId) !== manualRevision;
            if (!manualChanged) this.apply(serverId, result);
            this.complete(serverId, { ...result, manualChanged });
            return { ...result, manualChanged };
        }
    }

    return { MAX_RESTART_AGE_MS, exactRestartTime, decide, Coordinator };
});
