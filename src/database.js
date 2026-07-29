const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

class Database {

    constructor(databasePath = null) {

        this.databasePath = databasePath || process.env.STM_DATABASE_PATH || path.join(
            __dirname,
            "../database/stm.db"
        );

        this.db = null;
    }

    open() {

        if (this.db) {
            return Promise.resolve();
        }

        fs.mkdirSync(
            path.dirname(this.databasePath),
            { recursive: true }
        );

        return new Promise((resolve, reject) => {

            this.db = new sqlite3.Database(
                this.databasePath,
                error => {

                    if (error) {
                        this.db = null;
                        reject(error);
                        return;
                    }

                    resolve();
                }
            );
        });
    }

    exec(sql) {

        return new Promise((resolve, reject) => {

            this.db.exec(sql, error => {

                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    run(sql, parameters = []) {

        return new Promise((resolve, reject) => {

            this.db.run(
                sql,
                parameters,
                function (error) {

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve({
                        id: this.lastID,
                        changes: this.changes
                    });
                }
            );
        });
    }

    async init() {

        await this.open();

        await this.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS server_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                success INTEGER NOT NULL,
                name TEXT,
                map TEXT,
                version TEXT,
                players INTEGER,
                max_players INTEGER,
                ping INTEGER,
                steam_id TEXT,
                query_port INTEGER,
                error TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_server_snapshots_server_time
            ON server_snapshots(server_id, timestamp);

            CREATE TABLE IF NOT EXISTS player_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER NOT NULL,
                server_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                player_name TEXT NOT NULL,
                score INTEGER,
                session_time REAL,
                FOREIGN KEY(snapshot_id)
                    REFERENCES server_snapshots(id)
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_player_snapshots_server_time
            ON player_snapshots(server_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_player_snapshots_name
            ON player_snapshots(player_name);

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                type TEXT NOT NULL,
                player TEXT,
                message TEXT,
                data_json TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_events_server_time
            ON events(server_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_events_type
            ON events(type);

            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        `);
    }

    async getMetadata(key) {
        if (!this.db) {
            throw new Error("Database is not open");
        }

        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT value, updated_at FROM app_metadata WHERE key = ?",
                [key],
                (error, row) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(row || null);
                }
            );
        });
    }

    async setMetadata(key, value, updatedAt = new Date().toISOString()) {
        await this.run(
            `
            INSERT INTO app_metadata (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            `,
            [key, value, updatedAt]
        );
        return { key, value, updatedAt };
    }

    async saveSnapshot(serverState) {

        const timestamp =
            serverState.timestamp || new Date().toISOString();

        await this.run("BEGIN TRANSACTION");

        try {

            const snapshot = await this.run(
                `
                INSERT INTO server_snapshots (
                    server_id,
                    timestamp,
                    success,
                    name,
                    map,
                    version,
                    players,
                    max_players,
                    ping,
                    steam_id,
                    query_port,
                    error
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    serverState.id,
                    timestamp,
                    serverState.success ? 1 : 0,
                    serverState.name || null,
                    serverState.map || null,
                    serverState.version || null,
                    serverState.players ?? null,
                    serverState.maxPlayers ?? null,
                    serverState.ping ?? null,
                    serverState.steamId
                        ? String(serverState.steamId)
                        : null,
                    serverState.queryPort ?? null,
                    serverState.error || null
                ]
            );

            if (
                serverState.success &&
                Array.isArray(serverState.playerList)
            ) {

                for (const player of serverState.playerList) {

                    await this.run(
                        `
                        INSERT INTO player_snapshots (
                            snapshot_id,
                            server_id,
                            timestamp,
                            player_name,
                            score,
                            session_time
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        `,
                        [
                            snapshot.id,
                            serverState.id,
                            timestamp,
                            player.name,
                            player.score ?? 0,
                            player.time ?? 0
                        ]
                    );
                }
            }

            await this.run("COMMIT");

            return snapshot.id;

        } catch (error) {

            await this.run("ROLLBACK").catch(() => {});

            throw error;
        }
    }

    async saveEvent(serverId, event, timestamp = null) {

        const eventTimestamp =
            timestamp || new Date().toISOString();

        const result = await this.run(
            `
            INSERT INTO events (
                server_id,
                timestamp,
                type,
                player,
                message,
                data_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                serverId,
                eventTimestamp,
                event.type,
                event.player || null,
                event.message || null,
                JSON.stringify(event)
            ]
        );

        return result.id;
    }

    close() {

        if (!this.db) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {

            this.db.close(error => {

                if (error) {
                    reject(error);
                    return;
                }

                this.db = null;
                resolve();
            });
        });
    }

}

module.exports = Database;
