const RANGE_MS = Object.freeze({
    "30m": 30 * 60 * 1000,
    "2h": 2 * 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "48h": 48 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
});

const MAX_RANGE_MS = RANGE_MS["7d"];
const MAX_RAW_RANGE_MS = 60 * 60 * 1000;

class TelemetryHistory {

    constructor(options = {}) {
        this.maximumPoints = options.maximumPoints ?? 360;
        this.overviewMaximumPoints =
            options.overviewMaximumPoints ?? 900;
        this.maximumAllowedPoints =
            options.maximumAllowedPoints ?? 2000;
    }

    getRangeMs(range) {
        return RANGE_MS[range] || null;
    }

    normalizeMaximumPoints(value, fallback = this.maximumPoints) {
        const parsed = Number.parseInt(value, 10);

        if (!Number.isInteger(parsed)) return fallback;

        return Math.min(
            Math.max(parsed, 60),
            this.maximumAllowedPoints
        );
    }

    getBucketMs(rangeMs, maximumPoints = this.maximumPoints) {
        return Math.max(
            1000,
            Math.ceil(rangeMs / Math.max(1, maximumPoints))
        );
    }

    getSnapshotStatus(snapshot) {
        if (snapshot.status) {
            return String(snapshot.status).toUpperCase();
        }

        return snapshot.success ? "ONLINE" : "OFFLINE";
    }

    createRawPoint(snapshot) {
        const ping = snapshot.success && Number.isFinite(Number(snapshot.ping))
            ? Number(snapshot.ping)
            : null;
        const players = snapshot.success && Number.isFinite(Number(snapshot.players))
            ? Number(snapshot.players)
            : null;
        const maxPlayers = Number.isFinite(Number(snapshot.maxPlayers))
            ? Number(snapshot.maxPlayers)
            : null;

        return {
            timestamp: snapshot.timestamp,
            ping,
            players,
            maxPlayers,
            status: this.getSnapshotStatus(snapshot),
            successRate: snapshot.success ? 1 : 0,
            samples: 1,
            minPing: ping,
            maxPing: ping,
            minPlayers: players,
            maxPlayersObserved: players,
            bucketFrom: snapshot.timestamp,
            bucketTo: snapshot.timestamp,
            error: snapshot.error || null
        };
    }

    raw(snapshots, startMs, endMs) {
        return snapshots
            .filter(snapshot => {
                const timestamp = Date.parse(snapshot.timestamp);
                return Number.isFinite(timestamp) &&
                    timestamp >= startMs && timestamp <= endMs;
            })
            .sort((left, right) =>
                Date.parse(left.timestamp) - Date.parse(right.timestamp)
            )
            .map(snapshot => this.createRawPoint(snapshot));
    }

    getSourceSummary(snapshots) {
        const buckets = new Map();
        snapshots.forEach(snapshot => {
            const samples = Number(snapshot.sourceSamples);
            const successful = Number(snapshot.successfulSamples);
            if (!Number.isFinite(samples) || !Number.isFinite(successful) || snapshot.sourceBucketIndex === undefined) return;
            const key = `${snapshot.serverId || ''}:${snapshot.sourceBucketIndex}`;
            if (!buckets.has(key)) buckets.set(key, { samples, successful });
        });

        if (buckets.size > 0) {
            return Array.from(buckets.values()).reduce(
                (total, bucket) => ({
                    samples: total.samples + bucket.samples,
                    successful: total.successful + bucket.successful
                }),
                { samples: 0, successful: 0 }
            );
        }

        return {
            samples: snapshots.length,
            successful: snapshots.filter(snapshot => snapshot.success).length
        };
    }

    getBucketRepresentatives(bucket, restartTimes) {
        const snapshots = bucket.snapshots;
        const selected = new Set([0, snapshots.length - 1]);
        const successful = snapshots
            .map((snapshot, index) => ({ snapshot, index }))
            .filter(item => item.snapshot.success);

        const selectExtreme = (field, compare) => {
            const candidates = successful.filter(item =>
                Number.isFinite(Number(item.snapshot[field]))
            );
            if (candidates.length === 0) return;
            selected.add(candidates.reduce((best, item) =>
                compare(Number(item.snapshot[field]), Number(best.snapshot[field]))
                    ? item
                    : best
            ).index);
        };

        selectExtreme("ping", (value, best) => value < best);
        selectExtreme("ping", (value, best) => value > best);
        selectExtreme("players", (value, best) => value < best);
        selectExtreme("players", (value, best) => value > best);

        for (let index = 1; index < snapshots.length; index += 1) {
            if (
                this.getSnapshotStatus(snapshots[index]) !==
                this.getSnapshotStatus(snapshots[index - 1])
            ) {
                selected.add(index - 1);
                selected.add(index);
            }
        }

        for (const restartTime of restartTimes) {
            if (restartTime < bucket.startMs || restartTime > bucket.endMs) continue;
            let before = null;
            let after = null;
            snapshots.forEach((snapshot, index) => {
                const timestamp = Date.parse(snapshot.timestamp);
                if (timestamp <= restartTime) before = index;
                if (after === null && timestamp >= restartTime) after = index;
            });
            if (before !== null) selected.add(before);
            if (after !== null) selected.add(after);
        }

        const pings = successful
            .map(item => Number(item.snapshot.ping))
            .filter(Number.isFinite);
        const playerCounts = successful
            .map(item => Number(item.snapshot.players))
            .filter(Number.isFinite);
        const source = this.getSourceSummary(snapshots);
        const successRate = source.samples > 0 ? source.successful / source.samples : 0;
        const bucketStatus = successRate === 1
            ? "ONLINE"
            : successRate === 0
                ? "OFFLINE"
                : "DEGRADED";
        const summary = {
            samples: source.samples,
            successRate: Number(successRate.toFixed(3)),
            minPing: pings.length > 0 ? Math.min(...pings) : null,
            maxPing: pings.length > 0 ? Math.max(...pings) : null,
            minPlayers: playerCounts.length > 0 ? Math.min(...playerCounts) : null,
            maxPlayersObserved: playerCounts.length > 0 ? Math.max(...playerCounts) : null,
            bucketStatus,
            bucketFrom: snapshots[0].timestamp,
            bucketTo: snapshots.at(-1).timestamp
        };

        return Array.from(selected)
            .sort((left, right) => left - right)
            .map(index => ({
                ...this.createRawPoint(snapshots[index]),
                ...summary,
                status: this.getSnapshotStatus(snapshots[index])
            }));
    }

    downsample(
        snapshots,
        startMs,
        endMs,
        options = {}
    ) {
        const maximumPoints = this.normalizeMaximumPoints(
            options.maximumPoints,
            this.maximumPoints
        );
        const rangeMs = Math.max(1, endMs - startMs);
        const estimatedRepresentativesPerBucket = 6;
        const bucketCount = Math.max(
            1,
            Math.floor(maximumPoints / estimatedRepresentativesPerBucket)
        );
        const bucketMs = Math.max(
            1000,
            Math.ceil(rangeMs / bucketCount)
        );
        const buckets = new Map();

        for (const snapshot of snapshots) {
            const timestamp = Date.parse(snapshot.timestamp);
            if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) continue;
            const bucketIndex = Math.min(
                bucketCount - 1,
                Math.floor((timestamp - startMs) / bucketMs)
            );
            const bucket = buckets.get(bucketIndex) || {
                startMs: startMs + bucketIndex * bucketMs,
                endMs: Math.min(endMs, startMs + (bucketIndex + 1) * bucketMs),
                snapshots: []
            };
            bucket.snapshots.push(snapshot);
            buckets.set(bucketIndex, bucket);
        }

        const restartTimes = (options.restartTimes || [])
            .map(value => typeof value === "number" ? value : Date.parse(value))
            .filter(Number.isFinite);
        const points = Array.from(buckets.entries())
            .sort(([left], [right]) => left - right)
            .flatMap(([, bucket]) =>
                this.getBucketRepresentatives(bucket, restartTimes)
            );

        if (points.length <= maximumPoints) {
            return {
                points,
                bucketSizeMs: bucketMs,
                truncated: false
            };
        }

        const step = (points.length - 1) / (maximumPoints - 1);
        const compacted = Array.from(
            { length: maximumPoints },
            (_, index) => points[Math.round(index * step)]
        );

        return {
            points: Array.from(new Set(compacted)),
            bucketSizeMs: bucketMs,
            truncated: true
        };
    }

    getRestartMarker(event) {
        const data = event?.data || {};
        const classification = data.classification || null;
        const previousSteamId = data.previousSteamId;
        const currentSteamId = data.currentSteamId;
        const legacyInstanceChange = !classification && (
            data.reason === "STEAM_ID_ROTATION" ||
            (
                previousSteamId !== null && previousSteamId !== undefined &&
                currentSteamId !== null && currentSteamId !== undefined &&
                String(previousSteamId) !== String(currentSteamId)
            )
        );

        if (
            classification !== "PROCESS_RESTART" &&
            classification !== "PROCESS_RESTART_IN_OBSERVATION_GAP" &&
            !legacyInstanceChange
        ) {
            return null;
        }

        const timestamp = data.restartAt || data.observationWindow?.end || event.timestamp;
        if (!Number.isFinite(Date.parse(timestamp))) return null;

        return {
            timestamp,
            restartAt: data.restartAt || null,
            detectedAt: data.detectedAt || event.timestamp || null,
            classification: classification || "PROCESS_RESTART",
            confidence: data.confidence || "LEGACY_VERIFIED",
            timeKnown: data.timeKnown !== false,
            reason: data.reason || null,
            previousSteamId: previousSteamId ?? null,
            currentSteamId: currentSteamId ?? null,
            evidence: data.evidence || null,
            evidenceScore: data.evidenceScore || null,
            observationWindow: data.observationWindow || null
        };
    }

    buildSeries({
        serverIds,
        snapshots,
        events,
        states,
        startMs,
        endMs,
        resolution = "overview",
        maximumPoints = this.maximumPoints
    }) {
        return serverIds.map(serverId => {
            const serverSnapshots = snapshots.filter(
                snapshot => snapshot.serverId === serverId
            );
            const restarts = events
                .filter(event => event.serverId === serverId)
                .map(event => this.getRestartMarker(event))
                .filter(Boolean)
                .filter(marker => {
                    if (marker.classification === "PROCESS_RESTART_IN_OBSERVATION_GAP") {
                        const start = Date.parse(marker.observationWindow?.start);
                        const end = Date.parse(marker.observationWindow?.end);
                        return Number.isFinite(start) && Number.isFinite(end) && end >= startMs && start <= endMs;
                    }
                    const timestamp = Date.parse(marker.timestamp);
                    return timestamp >= startMs && timestamp <= endMs;
                });
            const state = states.find(item => item.id === serverId);
            let points;
            let bucketSizeMs = 0;
            let truncated = false;

            if (resolution === "raw") {
                points = this.raw(serverSnapshots, startMs, endMs);
            } else {
                const result = this.downsample(
                    serverSnapshots,
                    startMs,
                    endMs,
                    {
                        maximumPoints,
                        restartTimes: restarts
                            .filter(marker => marker.timeKnown)
                            .map(marker => marker.timestamp)
                    }
                );
                points = result.points;
                bucketSizeMs = result.bucketSizeMs;
                truncated = result.truncated;
            }

            return {
                serverId,
                points,
                restarts,
                prediction: state?.restartPrediction || null,
                metadata: {
                    resolution,
                    bucketSizeMs,
                    sourceSnapshotCount: this.getSourceSummary(serverSnapshots).samples,
                    returnedPointCount: points.length,
                    truncated
                }
            };
        });
    }
}

TelemetryHistory.RANGE_MS = RANGE_MS;
TelemetryHistory.MAX_RANGE_MS = MAX_RANGE_MS;
TelemetryHistory.MAX_RAW_RANGE_MS = MAX_RAW_RANGE_MS;

module.exports = TelemetryHistory;
