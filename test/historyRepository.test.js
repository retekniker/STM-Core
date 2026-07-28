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
