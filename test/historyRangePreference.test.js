const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const preference = require("../dashboard/historyRangePreference");
const { TelemetryInspectorController } = require("../dashboard/telemetryInspector");

function storageFixture(entries = []) {
    const values = new Map(entries);
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, value); }
    };
}

test("fresh history views default to 12h", () => {
    const storage = storageFixture();
    assert.equal(preference.DEFAULT_HISTORY_RANGE, "12h");
    assert.equal(preference.read(storage, preference.STORAGE_KEYS.telemetry), "12h");
    assert.equal(preference.read(storage, preference.STORAGE_KEYS.assetSaturation), "12h");
    assert.equal(new TelemetryInspectorController().range, "12h");
});

test("a local manual range survives the next app start", () => {
    const storage = storageFixture();
    assert.equal(preference.write(storage, preference.STORAGE_KEYS.telemetry, "2h"), true);
    assert.equal(preference.read(storage, preference.STORAGE_KEYS.telemetry), "2h");
    assert.equal(preference.read(storageFixture(), preference.STORAGE_KEYS.telemetry), "12h");
    assert.equal(preference.write(storage, preference.STORAGE_KEYS.assetSaturation, "7d"), true);
    assert.equal(preference.read(storage, preference.STORAGE_KEYS.assetSaturation), "7d");
});

test("dashboard persists each range locally and does not use the backend", () => {
    const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");
    assert.match(dashboard, /historyRangePreference\.js/);
    assert.match(dashboard, /STORAGE_KEYS\.telemetry/);
    assert.match(dashboard, /STORAGE_KEYS\.assetSaturation/);
    assert.doesNotMatch(dashboard, /jsoc_telemetry_range'\) \|\| '30m'/);
});
