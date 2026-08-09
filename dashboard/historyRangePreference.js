(function(root, factory) {
    const exported = factory();
    if (typeof module === "object" && module.exports) module.exports = exported;
    if (root) root.STMHistoryRangePreference = exported;
})(typeof window !== "undefined" ? window : globalThis, function() {
    const DEFAULT_HISTORY_RANGE = "12h";
    const ALLOWED_RANGES = Object.freeze(["30m", "2h", "6h", "12h", "24h", "48h", "7d"]);
    const STORAGE_KEYS = Object.freeze({
        telemetry: "jsoc_telemetry_range",
        assetSaturation: "jsoc_asset_saturation_range"
    });

    function read(storage, key) {
        try {
            const stored = storage?.getItem(key);
            return ALLOWED_RANGES.includes(stored) ? stored : DEFAULT_HISTORY_RANGE;
        } catch (_) {
            return DEFAULT_HISTORY_RANGE;
        }
    }

    function write(storage, key, range) {
        if (!ALLOWED_RANGES.includes(range)) return false;
        try {
            storage?.setItem(key, range);
            return true;
        } catch (_) {
            return false;
        }
    }

    return { DEFAULT_HISTORY_RANGE, ALLOWED_RANGES, STORAGE_KEYS, read, write };
});
