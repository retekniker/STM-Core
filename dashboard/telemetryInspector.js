(function(root, factory) {
    const preference = typeof module === "object" && module.exports
        ? require("./historyRangePreference")
        : root.STMHistoryRangePreference;
    const exported = factory(preference);
    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }
    if (root) root.TelemetryInspectorController = exported.TelemetryInspectorController;
})(typeof window !== "undefined" ? window : globalThis, function(preference) {
    const DEFAULT_RANGE = preference.DEFAULT_HISTORY_RANGE;
    const RANGES = Object.freeze({
        "30m": 30 * 60 * 1000,
        "2h": 2 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "48h": 48 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000
    });
    const MIN_VIEW_MS = 5 * 60 * 1000;
    const RAW_VIEW_MS = 60 * 60 * 1000;

    class TelemetryInspectorController {
        constructor(options = {}) {
            this.onChange = options.onChange || (() => {});
            this.range = DEFAULT_RANGE;
            this.serverId = null;
            this.overviewStart = 0;
            this.overviewEnd = 0;
            this.viewStart = 0;
            this.viewEnd = 0;
            this.restarts = [];
            this.restartCursor = -1;
        }

        open(serverId, range = DEFAULT_RANGE, endMs = Date.now()) {
            this.serverId = serverId;
            this.restarts = [];
            this.restartCursor = -1;
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

        setOverview(startMs, endMs) {
            if (!(endMs > startMs)) return false;
            this.overviewStart = startMs;
            this.overviewEnd = endMs;
            this.viewStart = Math.max(startMs, this.viewStart || startMs);
            this.viewEnd = Math.min(endMs, this.viewEnd || endMs);
            if (!(this.viewEnd > this.viewStart)) this.reset(false);
            this.emit("overview");
            return true;
        }

        restartTime(marker) {
            return Date.parse(marker.restartAt || marker.timestamp || marker.observationWindow?.end);
        }

        setRestarts(restarts = []) {
            const unique = new Map();
            restarts.forEach(marker => {
                const time = this.restartTime(marker);
                if (!Number.isFinite(time)) return;
                const key = marker.id !== undefined && marker.id !== null ? `id:${marker.id}` : `time:${time}`;
                if (!unique.has(key)) unique.set(key, marker);
            });
            this.restarts = Array.from(unique.values()).sort((left, right) => this.restartTime(left) - this.restartTime(right));
            this.restartCursor = this.restarts.length - 1;
            this.emit("restarts");
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
            this.restartCursor = this.restarts.length - 1;
            if (emit) this.emit("reset");
        }

        live() {
            const duration = this.viewEnd - this.viewStart || RANGES[this.range];
            this.clamp(this.overviewEnd - duration, this.overviewEnd);
            this.restartCursor = this.restarts.length - 1;
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
            if (this.restartCursor >= 0) {
                if (direction < 0 && this.restartCursor === 0) return null;
                if (direction >= 0 && this.restartCursor === this.restarts.length - 1) return null;
            }
            if (this.restartCursor < 0) {
                this.restartCursor = direction < 0
                    ? this.restarts.findLastIndex(marker => this.restartTime(marker) < this.viewEnd - 1000)
                    : this.restarts.findIndex(marker => this.restartTime(marker) > this.viewStart + 1000);
                if (this.restartCursor < 0) this.restartCursor = direction < 0 ? 0 : this.restarts.length - 1;
            } else {
                this.restartCursor = Math.max(0, Math.min(this.restarts.length - 1, this.restartCursor + (direction < 0 ? -1 : 1)));
            }
            const target = this.restartTime(this.restarts[this.restartCursor]);
            this.focusRestart(target);
            return target;
        }

        focusRestart(timestamp) {
            const time = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
            if (!Number.isFinite(time)) return false;
            const matchingIndex = this.restarts.findIndex(marker => this.restartTime(marker) === time);
            if (matchingIndex >= 0) this.restartCursor = matchingIndex;
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
                needsDetail: this.needsDetail(),
                restartIndex: this.restartCursor,
                restartCount: this.restarts.length,
                canPreviousRestart: this.restarts.length > 0 && this.restartCursor > 0,
                canNextRestart: this.restarts.length > 0 && this.restartCursor < this.restarts.length - 1
            };
        }
    }

    return { TelemetryInspectorController, RANGES, DEFAULT_RANGE, MIN_VIEW_MS, RAW_VIEW_MS };
});
