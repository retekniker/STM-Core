(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const DURATIONS = Object.freeze({
        info: 4000,
        success: 5000,
        warning: 7000,
        critical: 10000
    });
    const SEVERITY_RANK = Object.freeze({
        info: 0,
        success: 1,
        warning: 2,
        critical: 3
    });
    const CONNECTION_LATENCY_THRESHOLDS = Object.freeze({
        high: 200,
        veryHigh: 400
    });

    class DmdAlertController {
        constructor(options = {}) {
            this.now = options.now || Date.now;
            this.setTimer = options.setTimer || setTimeout;
            this.clearTimer = options.clearTimer || clearTimeout;
            this.renderAlert = options.renderAlert || (() => {});
            this.renderDefault = options.renderDefault || (() => {});
            this.onError = options.onError || (() => {});
            this.queueLimit = options.queueLimit ?? 20;
            this.maximumDurationMs = options.maximumDurationMs ?? 12000;
            this.maximumReceiveAgeMs = options.maximumReceiveAgeMs ?? 30000;
            this.queue = [];
            this.active = null;
            this.timer = null;
            this.seen = new Set();
            this.sequence = 0;
        }

        normalize(input = {}) {
            const now = this.now();
            const severity = Object.hasOwn(DURATIONS, input.severity)
                ? input.severity
                : "info";
            const occurredAt = Number.isFinite(Number(input.occurredAt))
                ? Number(input.occurredAt)
                : Date.parse(input.occurredAt || "");
            const receivedAt = Number.isFinite(Number(input.receivedAt))
                ? Number(input.receivedAt)
                : now;
            const requestedDuration = Number.isFinite(Number(input.durationMs))
                ? Number(input.durationMs)
                : DURATIONS[severity];
            const durationMs = Math.max(
                0,
                Math.min(this.maximumDurationMs, requestedDuration)
            );
            const requestedExpiresAt = Number.isFinite(Number(input.expiresAt))
                ? Number(input.expiresAt)
                : null;
            const monitoringSessionId = input.monitoringSessionId || null;
            const dedupeKey = input.dedupeKey || null;

            return {
                id: input.id || `dmd-${++this.sequence}`,
                text: String(input.text || ""),
                severity,
                source: input.source || "system",
                serverId: input.serverId || null,
                occurredAt: Number.isFinite(occurredAt) ? occurredAt : receivedAt,
                receivedAt,
                expiresAt: requestedExpiresAt,
                queueExpiresAt: receivedAt + this.maximumReceiveAgeMs,
                durationMs,
                dedupeKey,
                monitoringSessionId,
                colorClass: input.colorClass || null
            };
        }

        dedupeId(item) {
            if (!item.dedupeKey) return null;
            return `${item.monitoringSessionId || "global"}:${item.dedupeKey}`;
        }

        enqueue(input) {
            const item = this.normalize(input);
            const now = this.now();
            if (now - item.occurredAt > this.maximumReceiveAgeMs) return false;
            if (item.queueExpiresAt <= now || (item.expiresAt !== null && item.expiresAt <= now)) return false;

            const dedupeId = this.dedupeId(item);
            if (dedupeId && this.seen.has(dedupeId)) return false;
            if (dedupeId) this.seen.add(dedupeId);

            if (item.severity === "critical" && this.active &&
                this.active.severity !== "critical") {
                this.clearActiveTimer();
                this.active = null;
                this.insert(item);
                this.advance();
                return true;
            }

            this.insert(item);
            if (!this.active) this.advance();
            return true;
        }

        insert(item) {
            const rank = SEVERITY_RANK[item.severity];
            const position = this.queue.findIndex(queued =>
                SEVERITY_RANK[queued.severity] < rank
            );
            if (position === -1) this.queue.push(item);
            else this.queue.splice(position, 0, item);

            if (this.queue.length > this.queueLimit) {
                this.queue.length = this.queueLimit;
            }
        }

        clearActiveTimer() {
            if (this.timer !== null) this.clearTimer(this.timer);
            this.timer = null;
        }

        discardExpired(now = this.now()) {
            this.queue = this.queue.filter(item =>
                item.queueExpiresAt > now && (item.expiresAt === null || item.expiresAt > now)
            );
        }

        advance() {
            const now = this.now();
            this.clearActiveTimer();
            this.discardExpired(now);

            if (this.active && this.active.expiresAt > now) {
                this.schedule(this.active.expiresAt - now);
                return;
            }
            this.active = null;

            while (this.queue.length) {
                const next = this.queue.shift();
                if (next.queueExpiresAt <= now || (next.expiresAt !== null && next.expiresAt <= now)) continue;
                next.expiresAt = Math.min(
                    next.expiresAt ?? Number.POSITIVE_INFINITY,
                    now + Math.min(next.durationMs, this.maximumDurationMs)
                );
                this.active = next;
                try {
                    this.renderAlert(next);
                } catch (error) {
                    this.onError(error, next);
                    this.active = null;
                    continue;
                }
                this.schedule(next.expiresAt - now);
                return;
            }

            this.reset();
        }

        schedule(delayMs) {
            this.timer = this.setTimer(() => this.advance(), Math.max(0, delayMs));
        }

        refresh() {
            this.advance();
        }

        reset() {
            this.clearActiveTimer();
            this.active = null;
            try {
                this.renderDefault();
            } catch (error) {
                this.onError(error, null);
            }
        }
    }

    class RestartLiveGate {
        constructor(options = {}) {
            this.now = options.now || Date.now;
            this.maximumAgeMs = options.maximumAgeMs ?? 30000;
            this.sessionId = null;
            this.baselines = new Map();
            this.seen = new Set();
        }

        observe({ monitoringSessionId, serverId, detectedAt }) {
            if (!monitoringSessionId || !serverId) return { live: false, reason: "INVALID" };
            if (this.sessionId !== monitoringSessionId) {
                this.sessionId = monitoringSessionId;
                this.baselines.clear();
                this.seen.clear();
            }

            const key = `${monitoringSessionId}:${serverId}:${detectedAt || "NONE"}`;
            if (!this.baselines.has(serverId)) {
                this.baselines.set(serverId, detectedAt || null);
                return { live: false, reason: "BASELINE", key };
            }
            if (!detectedAt || this.baselines.get(serverId) === detectedAt || this.seen.has(key)) {
                return { live: false, reason: "DUPLICATE", key };
            }

            this.baselines.set(serverId, detectedAt);
            this.seen.add(key);
            const occurredAt = Date.parse(detectedAt);
            if (!Number.isFinite(occurredAt) || this.now() - occurredAt > this.maximumAgeMs) {
                return { live: false, reason: "STALE", key, occurredAt };
            }
            return { live: true, reason: "LIVE", key, occurredAt };
        }
    }

    class ConnectionAlertGate {
        constructor(options = {}) {
            this.highLatencyMs = options.highLatencyMs ?? CONNECTION_LATENCY_THRESHOLDS.high;
            this.veryHighLatencyMs = options.veryHighLatencyMs ?? CONNECTION_LATENCY_THRESHOLDS.veryHigh;
            this.states = new Map();
            this.sequence = 0;
        }

        classify(status, ping) {
            if (String(status || "").toLowerCase() === "offline") return "OFFLINE";
            const latency = Number(ping);
            if (!Number.isFinite(latency) || latency <= 0) return "UNKNOWN";
            if (latency > this.veryHighLatencyMs) return "VERY_HIGH";
            if (latency > this.highLatencyMs) return "HIGH";
            return "NORMAL";
        }

        observe({ serverId, status, ping }) {
            if (!serverId) return null;
            const state = this.classify(status, ping);
            const previous = this.states.get(serverId);
            this.states.set(serverId, state);
            if (!previous || previous === state || state === "UNKNOWN") return null;

            const latency = Number(ping);
            const pingLabel = Number.isFinite(latency) && latency > 0
                ? `${Math.round(latency)}MS`
                : "PING UNAVAILABLE";
            const key = `connectivity:${serverId}:${state}:${++this.sequence}`;

            if (state === "OFFLINE") {
                return {
                    severity: "critical",
                    colorClass: "dmd-alarm-red",
                    text: `[ ! ] ${serverId} OFFLINE // ${pingLabel} [ ! ]`,
                    dedupeKey: key
                };
            }
            if (state === "VERY_HIGH") {
                return {
                    severity: "warning",
                    colorClass: "dmd-alarm-red",
                    text: `[ !! ] ${serverId} VERY HIGH LATENCY // ${pingLabel} [ !! ]`,
                    dedupeKey: key
                };
            }
            if (state === "HIGH") {
                return {
                    severity: "warning",
                    colorClass: "dmd-alarm-yellow",
                    text: `[ ! ] ${serverId} HIGH LATENCY // ${pingLabel} [ ! ]`,
                    dedupeKey: key
                };
            }
            if (state === "NORMAL" && ["HIGH", "VERY_HIGH", "OFFLINE"].includes(previous)) {
                return {
                    severity: "success",
                    colorClass: "dmd-alarm-green",
                    text: `${serverId} CONNECTION RECOVERED // ${pingLabel}`,
                    dedupeKey: key
                };
            }
            return null;
        }
    }

    return {
        DmdAlertController,
        RestartLiveGate,
        ConnectionAlertGate,
        DMD_ALERT_DURATIONS: DURATIONS,
        CONNECTION_LATENCY_THRESHOLDS
    };
});
