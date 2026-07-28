const sqlite3 = require("sqlite3");
const RestartTracker = require("../src/restartTracker");
const RestartPrediction = require("../src/restartPrediction");

const databasePath = process.argv[2];

if (!databasePath) {
    throw new Error(
        "Usage: node tools/replayRestartDatabase.js <database>"
    );
}

const database = new sqlite3.Database(
    databasePath,
    sqlite3.OPEN_READONLY
);

database.all(
    `
    SELECT
        server_id,
        timestamp,
        success,
        players,
        steam_id
    FROM server_snapshots
    ORDER BY timestamp ASC, id ASC
    `,
    async (error, rows) => {
        if (error) {
            database.close();
            throw error;
        }

        const tracker = new RestartTracker();
        const prediction = new RestartPrediction();
        const events = [];

        for (const row of rows) {
            const result = tracker.process({
                state: {
                    id: row.server_id,
                    timestamp: row.timestamp,
                    players: row.players
                },
                queryResult: {
                    success: row.success === 1,
                    steamId: row.steam_id,
                    players: row.players,
                    playerList: []
                },
                reliabilityEvents: []
            });

            for (const event of result.events) {
                prediction.addEvent(row.server_id, event);
                events.push({
                    serverId: row.server_id,
                    classification: event.classification,
                    restartAt: event.restartAt,
                    detectedAt: event.detectedAt,
                    previousSteamId: event.previousSteamId,
                    currentSteamId: event.currentSteamId,
                    rejectedSteamIds: event.rejectedSteamIds,
                    evidenceScore: event.evidenceScore
                });
            }
        }

        const serverIds = [
            ...new Set(rows.map(row => row.server_id))
        ];
        const predictions = Object.fromEntries(
            serverIds.map(serverId => [
                serverId,
                prediction.getPrediction(serverId)
            ])
        );

        process.stdout.write(`${JSON.stringify({
            snapshotCount: rows.length,
            restartCount: events.length,
            events,
            predictions
        }, null, 2)}\n`);

        database.close();
    }
);
