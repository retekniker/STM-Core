const RANGE_CONFIG = Object.freeze({
    "30m": { durationMs: 30 * 60 * 1000, bucketMs: 5 * 1000 },
    "2h": { durationMs: 2 * 60 * 60 * 1000, bucketMs: 30 * 1000 },
    "6h": { durationMs: 6 * 60 * 60 * 1000, bucketMs: 60 * 1000 },
    "12h": { durationMs: 12 * 60 * 60 * 1000, bucketMs: 2 * 60 * 1000 },
    "24h": { durationMs: 24 * 60 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
    "48h": { durationMs: 48 * 60 * 60 * 1000, bucketMs: 10 * 60 * 1000 },
    "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, bucketMs: 30 * 60 * 1000 }
});

class AssetSaturationHistory {
    getRange(range) {
        return RANGE_CONFIG[range] || null;
    }

    aggregate({ snapshots, serverIds, startMs, endMs, bucketMs }) {
        const configured = Array.from(new Set(serverIds));
        const bucketCount = Math.ceil((endMs - startMs) / bucketMs);
        const buckets = Array.from({ length: bucketCount }, (_, index) => ({
            timestamp: new Date(Math.min(endMs, startMs + (index + 1) * bucketMs)).toISOString(),
            latest: new Map(),
            sourceSamples: 0
        }));

        snapshots.forEach(snapshot => {
            if (!configured.includes(snapshot.serverId)) return;
            const time = Date.parse(snapshot.timestamp);
            if (!Number.isFinite(time) || time < startMs || time > endMs) return;
            const index = Math.min(bucketCount - 1, Math.floor((time - startMs) / bucketMs));
            const bucket = buckets[index];
            bucket.sourceSamples += Number(snapshot.sourceSamples) || 1;
            const previous = bucket.latest.get(snapshot.serverId);
            if (!previous || Date.parse(previous.timestamp) <= time) bucket.latest.set(snapshot.serverId, snapshot);
        });

        return buckets.map(bucket => {
            const representatives = configured.map(serverId => bucket.latest.get(serverId));
            const complete = configured.length > 0 && representatives.every(snapshot =>
                snapshot?.success === true && Number.isInteger(Number(snapshot.players)) && Number(snapshot.players) >= 0
            );
            return {
                timestamp: bucket.timestamp,
                players: complete
                    ? representatives.reduce((sum, snapshot) => sum + Number(snapshot.players), 0)
                    : null,
                complete,
                sourceSamples: bucket.sourceSamples,
                serverSamples: complete
                    ? Object.fromEntries(configured.map((serverId, index) => [serverId, Number(representatives[index].players)]))
                    : null
            };
        });
    }
}

AssetSaturationHistory.RANGE_CONFIG = RANGE_CONFIG;
module.exports = AssetSaturationHistory;
