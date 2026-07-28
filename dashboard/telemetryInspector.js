(function(root, factory) {
    const exported = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }
    if (root) root.TelemetryInspectorController = exported.TelemetryInspectorController;
})(typeof window !== "undefined" ? window : globalThis, function() {
    const RANGES = Object.freeze({
        "30m": 30 * 60 * 1000,
        "2h": 2 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "48h": 48 * 60 * 60 * 1000
    });
    const MIN_VIEW_MS = 5 * 60 * 1000;
    const RAW_VIEW_MS = 60 * 60 * 1000;

    class TelemetryInspectorController {
        constructor(options = {}) {
            this.onChange = options.onChange || (() => {});
            this.range = "30m";
            this.serverId = null;
            this.overviewStart = 0;
            this.overviewEnd = 0;
            this.viewStart = 0;
            this.viewEnd = 0;
            this.restarts = [];
        }

        open(serverId, range = "30m", endMs = Date.now()) {
            this.serverId = serverId;
            this.setRange(range, endMs, false);
            this.emit("open");
        }

        setRange(range, endMs = Date.now(), emit = true) {
            if (!RANGES[range]) return false;
            this.range = range;
            this.overviewEnd = endMs;
            this.overviewStart = endMs - RANGES[range];
            this.reset(false);
            if (emit) this.emit("range");
            return true;
        }

        setOverview(startMs, endMs, restarts = []) {
            if (!(endMs > startMs)) return false;
            this.overviewStart = startMs;
            this.overviewEnd = endMs;
            this.viewStart = Math.max(startMs, this.viewStart || startMs);
            this.viewEnd = Math.min(endMs, this.viewEnd || endMs);
            if (!(this.viewEnd > this.viewStart)) this.reset(false);
            this.restarts = restarts
                .filter(marker => marker.timeKnown !== false && Number.isFinite(Date.parse(marker.restartAt || marker.timestamp)))
                .sort((left, right) => Date.parse(left.restartAt || left.timestamp) - Date.parse(right.restartAt || right.timestamp));
            this.emit("overview");
            return true;
        }

        clamp(startMs, endMs) {
            const overviewDuration = this.overviewEnd - this.overviewStart;
            let duration = Math.min(Math.max(endMs - startMs, MIN_VIEW_MS), overviewDuration);
            let start = startMs;
            let end = start + duration;
            if (start < this.overviewStart) {
                start = this.overviewStart;
                end = start + duration;
            }
            if (end > this.overviewEnd) {
                end = this.overviewEnd;
                start = end - duration;
            }
            this.viewStart = start;
            this.viewEnd = end;
        }

        reset(emit = true) {
            this.viewStart = this.overviewStart;
            this.viewEnd = this.overviewEnd;
            if (emit) this.emit("reset");
        }

        live() {
            const duration = this.viewEnd - this.viewStart || RANGES[this.range];
            this.clamp(this.overviewEnd - duration, this.overviewEnd);
            this.emit("live");
        }

        pan(deltaMs) {
            this.clamp(this.viewStart + deltaMs, this.viewEnd + deltaMs);
            this.emit("pan");
        }

        zoom(factor, anchorRatio = 0.5) {
            if (!(factor > 0)) return;
            const ratio = Math.min(1, Math.max(0, anchorRatio));
            const duration = this.viewEnd - this.viewStart;
            const nextDuration = Math.min(
                Math.max(duration * factor, MIN_VIEW_MS),
                this.overviewEnd - this.overviewStart
            );
            const anchor = this.viewStart + duration * ratio;
            this.clamp(anchor - nextDuration * ratio, anchor + nextDuration * (1 - ratio));
            this.emit("zoom");
        }

        setNavigatorWindow(startRatio, endRatio) {
            const start = Math.max(0, Math.min(1, startRatio));
            const end = Math.max(start, Math.min(1, endRatio));
            const duration = this.overviewEnd - this.overviewStart;
            this.clamp(
                this.overviewStart + duration * start,
                this.overviewStart + duration * end
            );
            this.emit("navigator");
        }

        navigateRestart(direction) {
            if (!this.restarts.length) return null;
            const center = (this.viewStart + this.viewEnd) / 2;
            const times = this.restarts.map(marker => Date.parse(marker.restartAt || marker.timestamp));
            const candidates = direction < 0
                ? times.filter(time => time < center - 1000).reverse()
                : times.filter(time => time > center + 1000);
            const target = candidates[0] ?? (direction < 0 ? times.at(-1) : times[0]);
            this.focusRestart(target);
            return target;
        }

        focusRestart(timestamp) {
            const time = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
            if (!Number.isFinite(time)) return false;
            this.clamp(time - 15 * 60 * 1000, time + 30 * 60 * 1000);
            this.emit("restart");
            return true;
        }

        needsDetail() {
            return this.viewEnd - this.viewStart <= RAW_VIEW_MS;
        }

        emit(reason) {
            this.onChange(this.snapshot(), reason);
        }

        snapshot() {
            return {
                serverId: this.serverId,
                range: this.range,
                overviewStart: this.overviewStart,
                overviewEnd: this.overviewEnd,
                viewStart: this.viewStart,
                viewEnd: this.viewEnd,
                needsDetail: this.needsDetail()
            };
        }
    }

    return { TelemetryInspectorController, RANGES, MIN_VIEW_MS, RAW_VIEW_MS };
});
