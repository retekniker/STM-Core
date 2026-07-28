class RestartPrediction {

    constructor(options = {}) {
        this.minimumEvents = options.minimumEvents ?? 3;
        this.minimumPredictionSamples =
            options.minimumPredictionSamples ?? 3;
        this.minimumCustomPredictionSamples =
            options.minimumCustomPredictionSamples ?? 4;
        this.minimumCustomCycleMs =
            options.minimumCustomCycleMs ?? 4 * 60 * 60 * 1000;
        this.maximumCustomCycleMs =
            options.maximumCustomCycleMs ?? 12 * 60 * 60 * 1000;
        this.maximumMultiple = options.maximumMultiple ?? 4;
        this.maximumEvents = options.maximumEvents ?? 100;
        this.windowRatio = options.windowRatio ?? 0.04;
        this.minimumWindowMs =
            options.minimumWindowMs ?? 10 * 60 * 1000;
        this.servers = new Map();
        this.fitCache = new Map();
    }

    hydrate(serverId, events = []) {
        this.servers.set(serverId, []);
        this.fitCache.delete(serverId);

        for (const event of events) {
            this.addEvent(serverId, event);
        }

        return this.getPrediction(serverId);
    }

    getExactRestart(event) {
        const data = event?.data || event || {};
        let classification =
            data.classification || event?.classification;
        const restartAt =
            data.restartAt || event?.restartAt;
        const reason = data.reason || event?.reason || null;
        const previousSteamId =
            data.previousSteamId ?? event?.previousSteamId;
        const currentSteamId =
            data.currentSteamId ?? event?.currentSteamId;
        const legacyInstanceChange =
            !classification &&
            (
                reason === "STEAM_ID_ROTATION" ||
                (
                    previousSteamId !== null &&
                    previousSteamId !== undefined &&
                    currentSteamId !== null &&
                    currentSteamId !== undefined &&
                    String(previousSteamId) !==
                        String(currentSteamId)
                )
            );

        if (legacyInstanceChange) {
            classification = "PROCESS_RESTART";
        }

        if (
            classification !== "PROCESS_RESTART" ||
            data.timeKnown === false ||
            !restartAt
        ) {
            return null;
        }

        const timestamp = Date.parse(restartAt);

        if (!Number.isFinite(timestamp)) {
            return null;
        }

        return {
            timestamp,
            restartAt: new Date(timestamp).toISOString(),
            detectedAt:
                data.detectedAt ||
                event?.detectedAt ||
                event?.timestamp ||
                null,
            classification,
            reason
        };
    }

    addEvent(serverId, event) {
        if (!serverId) {
            throw new Error("Server id is required");
        }

        const sample = this.getExactRestart(event);

        if (!sample) {
            return false;
        }

        const samples = this.servers.get(serverId) || [];

        if (
            samples.some(existing =>
                existing.timestamp === sample.timestamp
            )
        ) {
            return false;
        }

        samples.push(sample);
        samples.sort((left, right) =>
            left.timestamp - right.timestamp
        );

        if (samples.length > this.maximumEvents) {
            samples.splice(
                0,
                samples.length - this.maximumEvents
            );
        }

        this.servers.set(serverId, samples);
        this.fitCache.delete(serverId);

        return true;
    }

    getToleranceMs(cycleMs) {
        return Math.max(
            this.minimumWindowMs,
            cycleMs * this.windowRatio
        );
    }

    getCandidates(samples) {
        const sixHours = 6 * 60 * 60 * 1000;
        const eightHours = 8 * 60 * 60 * 1000;
        const candidates = [
            { cycleMs: sixHours, kind: "STANDARD_6H" },
            { cycleMs: eightHours, kind: "STANDARD_8H" }
        ];
        const customCycles = new Map();

        for (let left = 0; left < samples.length; left += 1) {
            for (
                let right = left + 1;
                right < samples.length;
                right += 1
            ) {
                const difference =
                    samples[right].timestamp -
                    samples[left].timestamp;

                for (
                    let multiple = 1;
                    multiple <= this.maximumMultiple;
                    multiple += 1
                ) {
                    const cycleMs = difference / multiple;

                    if (
                        cycleMs < this.minimumCustomCycleMs ||
                        cycleMs > this.maximumCustomCycleMs
                    ) {
                        continue;
                    }

                    const roundedCycleMs =
                        Math.round(cycleMs / 60000) * 60000;
                    customCycles.set(
                        roundedCycleMs,
                        {
                            cycleMs: roundedCycleMs,
                            kind: "CUSTOM"
                        }
                    );
                }
            }
        }

        customCycles.delete(sixHours);
        customCycles.delete(eightHours);

        return candidates.concat(
            [...customCycles.values()]
        );
    }

    evaluateCandidate(samples, candidate) {
        const toleranceMs =
            this.getToleranceMs(candidate.cycleMs);
        let best = null;

        for (const anchor of samples) {
            const inliers = [];
            const outliers = [];
            let totalErrorMs = 0;

            for (const sample of samples) {
                const cycles = Math.round(
                    (sample.timestamp - anchor.timestamp) /
                    candidate.cycleMs
                );
                const expected =
                    anchor.timestamp +
                    cycles * candidate.cycleMs;
                const errorMs = Math.abs(
                    sample.timestamp - expected
                );

                if (errorMs <= toleranceMs) {
                    inliers.push({
                        ...sample,
                        cycleIndex: cycles,
                        errorMs
                    });
                    totalErrorMs += errorMs;
                } else {
                    outliers.push(sample);
                }
            }

            inliers.sort((left, right) =>
                left.timestamp - right.timestamp
            );

            const intervalSamples = Math.max(
                0,
                inliers.length - 1
            );
            const meanErrorMs = inliers.length > 0
                ? totalErrorMs / inliers.length
                : Number.POSITIVE_INFINITY;
            const fit = {
                ...candidate,
                anchor: anchor.timestamp,
                toleranceMs,
                inliers,
                outliers,
                intervalSamples,
                meanErrorMs
            };

            if (!best || this.compareFits(fit, best) < 0) {
                best = fit;
            }
        }

        return best;
    }

    compareFits(left, right) {
        if (left.inliers.length !== right.inliers.length) {
            return right.inliers.length - left.inliers.length;
        }

        if (left.intervalSamples !== right.intervalSamples) {
            return right.intervalSamples - left.intervalSamples;
        }

        const leftStandard = left.kind === "CUSTOM" ? 0 : 1;
        const rightStandard = right.kind === "CUSTOM" ? 0 : 1;

        if (leftStandard !== rightStandard) {
            return rightStandard - leftStandard;
        }

        return left.meanErrorMs - right.meanErrorMs;
    }

    findBestFit(samples) {
        let best = null;

        for (const candidate of this.getCandidates(samples)) {
            const fit = this.evaluateCandidate(
                samples,
                candidate
            );

            if (!best || this.compareFits(fit, best) < 0) {
                best = fit;
            }
        }

        return best;
    }

    getPrediction(serverId, now = Date.now()) {
        const samples = this.servers.get(serverId) || [];

        if (samples.length < this.minimumEvents) {
            return {
                status: "INSUFFICIENT_DATA",
                serverId,
                eventCount: samples.length,
                sampleCount: 0,
                confidence: 0,
                cycleHours: null,
                cycleKind: null,
                predictedAt: null,
                predictedWindowStart: null,
                predictedWindowEnd: null,
                outliers: []
            };
        }

        let fit = this.fitCache.get(serverId);

        if (!fit) {
            fit = this.findBestFit(samples);
            this.fitCache.set(serverId, fit);
        }
        const sampleCount = fit.intervalSamples;
        const errorScore = Math.max(
            0,
            1 - fit.meanErrorMs / fit.toleranceMs
        );
        const coverage =
            fit.inliers.length / samples.length;
        const confidence = Number(
            (coverage * errorScore).toFixed(3)
        );
        const requiredSamples = fit.kind === "CUSTOM"
            ? this.minimumCustomPredictionSamples
            : this.minimumPredictionSamples;
        const predicted = sampleCount >= requiredSamples;
        let predictedTimestamp = null;

        if (predicted) {
            predictedTimestamp =
                fit.inliers[fit.inliers.length - 1]
                    .timestamp + fit.cycleMs;

            while (predictedTimestamp <= now) {
                predictedTimestamp += fit.cycleMs;
            }
        }

        return {
            status: predicted ? "PREDICTED" : "LEARNING",
            serverId,
            eventCount: samples.length,
            sampleCount,
            confidence,
            cycleHours: Number(
                (fit.cycleMs / 3600000).toFixed(3)
            ),
            cycleKind: fit.kind,
            toleranceMinutes: Math.round(
                fit.toleranceMs / 60000
            ),
            predictedAt: predictedTimestamp
                ? new Date(predictedTimestamp).toISOString()
                : null,
            predictedWindowStart: predictedTimestamp
                ? new Date(
                    predictedTimestamp - fit.toleranceMs
                ).toISOString()
                : null,
            predictedWindowEnd: predictedTimestamp
                ? new Date(
                    predictedTimestamp + fit.toleranceMs
                ).toISOString()
                : null,
            inliers: fit.inliers.map(sample => ({
                restartAt: sample.restartAt,
                errorSeconds: Math.round(
                    sample.errorMs / 1000
                )
            })),
            outliers: fit.outliers.map(sample => ({
                restartAt: sample.restartAt,
                classification: "UNSCHEDULED_OR_OUTLIER"
            }))
        };
    }
}

module.exports = RestartPrediction;
