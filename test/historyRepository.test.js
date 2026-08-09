const test = require("node:test");
const assert = require("node:assert/strict");

const Database = require("../src/database");
const HistoryRepository = require("../src/historyRepository");

test("server snapshot success filter returns the latest successful snapshot", async t => {
    const database = new Database(":memory:");
    await database.init();

    t.after(async () => {
        await database.close();
    });

    await database.run(
        `
        INSERT INTO server_snapshots (
            server_id,
            timestamp,
            success,
            players,
            steam_id,
            error
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            "EU1",
            "2026-07-28T03:21:20.655Z",
            1,
            11,
            "111",
            null
        ]
    );

    await database.run(
        `
        INSERT INTO server_snapshots (
            server_id,
            timestamp,
            success,
            players,
            steam_id,
            error
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            "EU1",
            "2026-07-28T03:22:00.745Z",
            0,
            11,
            "111",
            "Failed all 3 attempts"
        ]
    );

    const history =
        new HistoryRepository(database);

    const latest =
        await history.getLatestServerSnapshot("EU1");

    const successful =
        await history.getLatestSuccessfulServerSnapshot("EU1");

    assert.equal(latest.success, false);
    assert.equal(
        latest.timestamp,
        "2026-07-28T03:22:00.745Z"
    );

    assert.equal(successful.success, true);
    assert.equal(
        successful.timestamp,
        "2026-07-28T03:21:20.655Z"
    );
    assert.equal(successful.steamId, "111");
});

test("event queries do not contain the server snapshot success filter", async t => {
    const database = new Database(":memory:");
    await database.init();

    t.after(async () => {
        await database.close();
    });

    await database.saveEvent(
        "EU1",
        {
            type: "SERVER_RESTART",
            message: "Restart"
        },
        "2026-07-28T03:22:05.000Z"
    );

    const history =
        new HistoryRepository(database);

    const events = await history.getEvents({
        serverId: "EU1",
        type: "SERVER_RESTART",
        limit: 1
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "SERVER_RESTART");
});

test("snapshot range query is chronological and not pagination limited", async t => {
    const database = new Database(":memory:");
    await database.init();

    t.after(async () => {
        await database.close();
    });

    for (let index = 0; index < 3; index += 1) {
        await database.run(
            `
            INSERT INTO server_snapshots (
                server_id,
                timestamp,
                success,
                players,
                max_players,
                ping
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                "EU1",
                `2026-07-28T0${index + 1}:00:00.000Z`,
                1,
                index,
                64,
                20 + index
            ]
        );
    }

    const history = new HistoryRepository(database);
    const snapshots =
        await history.getServerSnapshotsBetween({
            serverId: "EU1",
            after: "2026-07-28T01:30:00.000Z",
            before: "2026-07-28T03:30:00.000Z"
        });

    assert.deepEqual(
        snapshots.map(snapshot => snapshot.players),
        [1, 2]
    );
});


test("bucketed snapshot query returns only the latest sample per server and preserves counts", async t => {
    const database = new Database(":memory:");
    await database.init();
    t.after(async () => { await database.close(); });

    for (const [serverId, timestamp, players] of [
        ["EU1", "2026-07-28T01:01:00.000Z", 1],
        ["EU1", "2026-07-28T01:20:00.000Z", 2],
        ["EU2", "2026-07-28T01:10:00.000Z", 3],
        ["EU1", "2026-07-28T01:40:00.000Z", 4]
    ]) {
        await database.run(
            "INSERT INTO server_snapshots (server_id, timestamp, success, players) VALUES (?, ?, 1, ?)",
            [serverId, timestamp, players]
        );
    }

    const history = new HistoryRepository(database);
    const snapshots = await history.getServerSnapshotsForBuckets({
        after: "2026-07-28T01:00:00.000Z",
        before: "2026-07-28T02:00:00.000Z",
        bucketMs: 30 * 60 * 1000
    });

    assert.deepEqual(
        snapshots.map(snapshot => [snapshot.serverId, snapshot.players, snapshot.sourceSamples]),
        [["EU2", 3, 1], ["EU1", 2, 2], ["EU1", 4, 1]]
    );
});

test("telemetry bucket query preserves extrema, failures and exact source counts", async t => {
    const database = new Database(":memory:");
    await database.init();
    t.after(async () => { await database.close(); });

    const samples = [
        ["2026-07-28T01:00:00.000Z", 1, 20, 10],
        ["2026-07-28T01:01:00.000Z", 1, 250, 11],
        ["2026-07-28T01:02:00.000Z", 0, null, null],
        ["2026-07-28T01:03:00.000Z", 1, 25, 40],
        ["2026-07-28T01:04:00.000Z", 1, 22, 12]
    ];
    for (const [timestamp, success, ping, players] of samples) {
        await database.run(
            `
            INSERT INTO server_snapshots (
                server_id, timestamp, success, players, max_players, ping
            ) VALUES (?, ?, ?, ?, ?, ?)
            `,
            ["EU1", timestamp, success, players, 64, ping]
        );
    }
    await database.run(
        "INSERT INTO server_snapshots (server_id, timestamp, success, players, ping) VALUES (?, ?, 1, ?, ?)",
        ["EU2", "2026-07-28T01:02:30.000Z", 9, 99]
    );

    const history = new HistoryRepository(database);
    const snapshots = await history.getServerSnapshotsForTelemetryBuckets({
        serverId: "EU1",
        after: "2026-07-28T01:00:00.000Z",
        before: "2026-07-28T01:10:00.000Z",
        bucketMs: 10 * 60 * 1000
    });

    assert.ok(snapshots.length <= samples.length);
    assert.ok(snapshots.some(snapshot => snapshot.ping === 250));
    assert.ok(snapshots.some(snapshot => snapshot.players === 40));
    assert.ok(snapshots.some(snapshot => snapshot.success === false));
    assert.ok(snapshots.every(snapshot => snapshot.serverId === "EU1"));
    assert.ok(snapshots.every(snapshot => snapshot.sourceSamples === 5));
    assert.ok(snapshots.every(snapshot => snapshot.successfulSamples === 4));
});
