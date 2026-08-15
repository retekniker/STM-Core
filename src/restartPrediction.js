class RestartPrediction {

    constructor(options = {}) {
        this.minimumEvents = options.minimumEvents ?? 4;
        this.minimumPredictionSamples = options.minimumPredictionSamples ?? 3;
        this.maximumEvents = options.maximumEvents ?? 500;
        this.historyWindowMs = options.historyWindowMs ?? 7 * 24 * 60 * 60 * 1000;
        this.minimumIntervalMs = options.minimumIntervalMs ?? 60 * 1000;
        this.windowRatio = options.windowRatio ?? 0.04;
        this.minimumWindowMs = options.minimumWindowMs ?? 10 * 60 * 1000;
        this.scheduleChangeIntervals = options.scheduleChangeIntervals ?? 3;
        this.servers = new Map();
    }

    hydrate(serverId, events = []) {
        this.servers.set(serverId, []);
        for (const event of events) this.addEvent(serverId, event);
        return this.getPrediction(serverId);
    }

    getExactRestart(event) {
        const data = event?.data || event || {};
        let classification = data.classification || event?.classification;
        const restartAt = data.restartAt || event?.restartAt;
        const reason = data.reason || event?.reason || null;
        const previousSteamId = data.previousSteamId ?? event?.previousSteamId;
        const currentSteamId = data.currentSteamId ?? event?.currentSteamId;
        const legacyInstanceChange = !classification && (
            reason === "STEAM_ID_ROTATION" ||
            (previousSteamId !== null && previousSteamId !== undefined &&
                currentSteamId !== null && currentSteamId !== undefined &&
                String(previousSteamId) !== String(currentSteamId))
        );

        if (legacyInstanceChange) classification = "PROCESS_RESTART";
        if (classification !== "PROCESS_RESTART" || data.timeKnown === false || !restartAt) return null;

        const timestamp = Date.parse(restartAt);
        if (!Number.isFinite(timestamp)) return null;

        return {
            timestamp,
            restartAt: new Date(timestamp).toISOString(),
            detectedAt: data.detectedAt || event?.detectedAt || event?.timestamp || null,
            classification,
            reason
        };
    }

    addEvent(serverId, event) {
        if (!serverId) throw new Error("Server id is required");
        const sample = this.getExactRestart(event);
        if (!sample) return false;

        const samples = this.servers.get(serverId) || [];
        if (samples.some(existing => existing.timestamp === sample.timestamp)) return false;

        samples.push(sample);
        samples.sort((left, right) => left.timestamp - right.timestamp);
        if (samples.length > this.maximumEvents) samples.splice(0, samples.length - this.maximumEvents);
        this.servers.set(serverId, samples);
        return true;
    }

    getToleranceMs(cycleMs) {
        return Math.max(this.minimumWindowMs, cycleMs * this.windowRatio);
    }

    median(values = []) {
        if (!values.length) return null;
        const sorted = [...values].sort((left, right) => left - right);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle];
    }

    round(value, digits = 3) {
        const factor = 10 ** digits;
        return Math.round(value * factor) / factor;
    }

    getWindowedSamples(serverId, now) {
        const cutoff = now - this.historyWindowMs;
        return (this.servers.get(serverId) || []).filter(sample =>
            sample.timestamp >= cutoff && sample.timestamp <= now
        );
    }

    getIntervals(samples) {
        const intervals = [];
        let previous = null;

        for (const sample of samples) {
            if (!previous) {
                previous = sample;
                continue;
            }

            const durationMs = sample.timestamp - previous.timestamp;
            if (!Number.isFinite(durationMs) || durationMs < this.minimumIntervalMs) continue;

            intervals.push({ start: previous, end: sample, durationMs });
            previous = sample;
        }

        return intervals;
    }

    getCluster(intervals, seedMs) {
        let members = intervals.filter(interval =>
            Math.abs(interval.durationMs - seedMs) <= this.getToleranceMs(seedMs)
        );
        let cycleMs = this.median(members.map(interval => interval.durationMs));
        if (!Number.isFinite(cycleMs)) return null;

        let toleranceMs = this.getToleranceMs(cycleMs);
        members = intervals.filter(interval =>
            Math.abs(interval.durationMs - cycleMs) <= toleranceMs
        );
        cycleMs = this.median(members.map(interval => interval.durationMs));
        if (!Number.isFinite(cycleMs)) return null;

        toleranceMs = this.getToleranceMs(cycleMs);
        const meanDeviationMs = members.reduce((total, interval) =>
            total + Math.abs(interval.durationMs - cycleMs), 0
        ) / members.length;

        return { cycleMs, toleranceMs, members, meanDeviationMs };
    }

    findDominantCluster(intervals) {
        let best = null;
        for (const interval of intervals) {
            const cluster = this.getCluster(intervals, interval.durationMs);
            if (!cluster) continue;
            if (!best ||
                cluster.members.length > best.members.length ||
                (cluster.members.length === best.members.length &&
                    cluster.meanDeviationMs < best.meanDeviationMs)) {
                best = cluster;
            }
        }
        return best;
    }

    getRecentScheduleChange(intervals, dominant) {
        const recent = intervals.slice(-this.scheduleChangeIntervals);
        if (recent.length < this.scheduleChangeIntervals) return null;

        const cycleMs = this.median(recent.map(interval => interval.durationMs));
        const toleranceMs = this.getToleranceMs(cycleMs);
        if (!recent.every(interval => Math.abs(interval.durationMs - cycleMs) <= toleranceMs)) return null;

        const changed = !dominant ||
            Math.abs(cycleMs - dominant.cycleMs) > Math.max(toleranceMs, dominant.toleranceMs);
        if (!changed) return null;

        const meanDeviationMs = recent.reduce((total, interval) =>
            total + Math.abs(interval.durationMs - cycleMs), 0
        ) / recent.length;
        return { cycleMs, toleranceMs, members: recent, meanDeviationMs, scheduleChanged: true };
    }

    getCycleKind(cycleMs) {
        const sixHours = 6 * 60 * 60 * 1000;
        const eightHours = 8 * 60 * 60 * 1000;
        if (Math.abs(cycleMs - sixHours) <= this.getToleranceMs(sixHours)) return "STANDARD_6H";
        if (Math.abs(cycleMs - eightHours) <= this.getToleranceMs(eightHours)) return "STANDARD_8H";
        return "CUSTOM";
    }

    getConfidence(cluster, intervals, lastRestartAt, now) {
        const quantity = Math.min(1, cluster.members.length / 5);
        const consistency = Math.max(0, 1 - cluster.meanDeviationMs / cluster.toleranceMs);
        const coverage = intervals.length ? cluster.members.length / intervals.length : 0;
        const ageMs = Math.max(0, now - lastRestartAt);
        const recency = Math.max(0, 1 - ageMs / (cluster.cycleMs * 2));
        return this.round(quantity * 0.3 + consistency * 0.35 + coverage * 0.25 + recency * 0.1);
    }

    resultWithoutPrediction(serverId, eventCount, status) {
        return {
            status,
            serverId,
            eventCount,
            sampleCount: 0,
            confidence: 0,
            cycleHours: null,
            cycleKind: null,
            predictedAt: null,
            predictedWindowStart: null,
            predictedWindowEnd: null,
            inliers: [],
            outliers: []
        };
    }

    getPrediction(serverId, now = Date.now()) {
        const samples = this.getWindowedSamples(serverId, now);
        if (samples.length < this.minimumEvents) {
            return this.resultWithoutPrediction(serverId, samples.length, "INSUFFICIENT_DATA");
        }

        const intervals = this.getIntervals(samples);
        const dominant = this.findDominantCluster(intervals);
        const fit = this.getRecentScheduleChange(intervals, dominant) || dominant;
        if (!fit || fit.members.length < this.minimumPredictionSamples) {
            return this.resultWithoutPrediction(serverId, samples.length, "LEARNING");
        }

        const lastRestart = samples[samples.length - 1];
        const predictedTimestamp = lastRestart.timestamp + fit.cycleMs;
        const stale = predictedTimestamp + fit.toleranceMs < now;
        const inlierEndTimes = new Set(fit.members.map(interval => interval.end.timestamp));
        const outlierEndTimes = new Set(intervals
            .filter(interval => !inlierEndTimes.has(interval.end.timestamp))
            .map(interval => interval.end.timestamp));
        const confidence = this.getConfidence(fit, intervals, lastRestart.timestamp, now);

        return {
            status: stale ? "STALE" : "PREDICTED",
            serverId,
            eventCount: samples.length,
            sampleCount: fit.members.length,
            confidence,
            cycleHours: this.round(fit.cycleMs / 3600000),
            cycleKind: this.getCycleKind(fit.cycleMs),
            toleranceMinutes: Math.round(fit.toleranceMs / 60000),
            historyWindowDays: this.historyWindowMs / 86400000,
            scheduleChanged: Boolean(fit.scheduleChanged),
            predictedAt: stale ? null : new Date(predictedTimestamp).toISOString(),
            predictedWindowStart: stale ? null : new Date(predictedTimestamp - fit.toleranceMs).toISOString(),
            predictedWindowEnd: stale ? null : new Date(predictedTimestamp + fit.toleranceMs).toISOString(),
            inliers: samples
                .filter(sample => inlierEndTimes.has(sample.timestamp))
                .map(sample => ({
                    restartAt: sample.restartAt,
                    errorSeconds: Math.round(Math.abs(
                        fit.members.find(interval => interval.end.timestamp === sample.timestamp).durationMs - fit.cycleMs
                    ) / 1000)
                })),
            outliers: samples
                .filter(sample => outlierEndTimes.has(sample.timestamp))
                .map(sample => ({
                    restartAt: sample.restartAt,
                    classification: "UNSCHEDULED_OR_OUTLIER"
                }))
        };
    }
}

module.exports = RestartPrediction;
