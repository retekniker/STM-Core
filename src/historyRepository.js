class HistoryRepository {

    constructor(database) {

        if (!database) {
            throw new Error(
                "HistoryRepository requires Database"
            );
        }

        this.database = database;
    }

    ensureDatabase() {

        if (!this.database.db) {
            throw new Error(
                "Database is not open"
            );
        }
    }

    all(sql, parameters = []) {

        this.ensureDatabase();

        return new Promise((resolve, reject) => {

            this.database.db.all(
                sql,
                parameters,
                (error, rows) => {

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(rows);
                }
            );
        });
    }

    normalizeLimit(value, defaultValue = 100) {

        const parsed = Number.parseInt(value, 10);

        if (!Number.isInteger(parsed)) {
            return defaultValue;
        }

        return Math.min(
            Math.max(parsed, 1),
            500
        );
    }

    async getEvents(options = {}) {

        const conditions = [];
        const parameters = [];

        if (options.serverId) {
            conditions.push("server_id = ?");
            parameters.push(options.serverId);
        }

        if (options.type) {
            conditions.push("type = ?");
            parameters.push(options.type);
        }

        if (options.player) {
            conditions.push("player = ?");
            parameters.push(options.player);
        }

        if (options.before) {
            conditions.push("timestamp < ?");
            parameters.push(options.before);
        }

        const whereClause =
            conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "";

        const limit = this.normalizeLimit(
            options.limit
        );

        parameters.push(limit);

        const rows = await this.all(
            `
            SELECT
                id,
                server_id,
                timestamp,
                type,
                player,
                message,
                data_json
            FROM events
            ${whereClause}
            ORDER BY timestamp DESC, id DESC
            LIMIT ?
            `,
            parameters
        );

        return rows.map(row => {

            let data = null;

            if (row.data_json) {
                try {
                    data = JSON.parse(row.data_json);
                } catch {
                    data = null;
                }
            }

            return {
                id: row.id,
                serverId: row.server_id,
                timestamp: row.timestamp,
                type: row.type,
                player: row.player,
                message: row.message,
                data
            };
        });
    }

    async getServerSnapshots(options = {}) {

        const conditions = [];
        const parameters = [];

        if (options.serverId) {
            conditions.push("server_id = ?");
            parameters.push(options.serverId);
        }

        if (options.before) {
            conditions.push("timestamp < ?");
            parameters.push(options.before);
        }

        if (
            options.success === true ||
            options.success === false
        ) {
            conditions.push("success = ?");
            parameters.push(
                options.success ? 1 : 0
            );
        }

        const whereClause =
            conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "";

        const limit = this.normalizeLimit(
            options.limit
        );

        parameters.push(limit);

        const rows = await this.all(
            `
            SELECT
                id,
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
            FROM server_snapshots
            ${whereClause}
            ORDER BY timestamp DESC, id DESC
            LIMIT ?
            `,
            parameters
        );

        return rows.map(row => ({
            id: row.id,
            serverId: row.server_id,
            timestamp: row.timestamp,
            success: row.success === 1,
            name: row.name,
            map: row.map,
            version: row.version,
            players: row.players,
            maxPlayers: row.max_players,
            ping: row.ping,
            steamId: row.steam_id,
            queryPort: row.query_port,
            error: row.error
        }));
    }

    async getPlayerHistory(
        playerName,
        options = {}
    ) {

        if (
            typeof playerName !== "string" ||
            playerName.trim().length === 0
        ) {
            throw new Error(
                "Player name is required"
            );
        }

        const conditions = [
            "player_name = ?"
        ];

        const parameters = [
            playerName.trim()
        ];

        if (options.serverId) {
            conditions.push("server_id = ?");
            parameters.push(options.serverId);
        }

        if (options.before) {
            conditions.push("timestamp < ?");
            parameters.push(options.before);
        }

        const limit = this.normalizeLimit(
            options.limit
        );

        parameters.push(limit);

        const rows = await this.all(
            `
            SELECT
                id,
                snapshot_id,
                server_id,
                timestamp,
                player_name,
                score,
                session_time
            FROM player_snapshots
            WHERE ${conditions.join(" AND ")}
            ORDER BY timestamp DESC, id DESC
            LIMIT ?
            `,
            parameters
        );

        return rows.map(row => ({
            id: row.id,
            snapshotId: row.snapshot_id,
            serverId: row.server_id,
            timestamp: row.timestamp,
            playerName: row.player_name,
            score: row.score,
            sessionTime: row.session_time
        }));
    }

    async getLatestServerSnapshot(serverId) {
        const snapshots = await this.getServerSnapshots({
            serverId,
            limit: 1
        });

        return snapshots[0] || null;
    }

    async getLatestSuccessfulServerSnapshot(serverId) {
        const snapshots = await this.getServerSnapshots({
            serverId,
            success: true,
            limit: 1
        });

        return snapshots[0] || null;
    }

    async getLatestEvent(serverId, type) {
        const events = await this.getEvents({
            serverId,
            type,
            limit: 1
        });

        return events[0] || null;
    }

}

module.exports = HistoryRepository;
