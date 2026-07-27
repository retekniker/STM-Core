const { GameDig } = require("gamedig");

class QueryEngine {

    async query(server) {

        try {

            const state = await GameDig.query({
                type: server.type,
                host: server.host,
                port: server.port,
                socketTimeout: 5000,
                maxAttempts: 2
            });

            return {
                success: true,
                timestamp: new Date().toISOString(),

                id: server.id,
                name: state.name,
                map: state.map,
                version: state.version,

                players: state.numplayers,
                maxPlayers: state.maxplayers,

                ping: state.ping,

                steamId: state.raw?.steamid || null,
                queryPort: state.queryPort,

                playerList: state.players.map(player => ({
                    name: player.name,
                    score: player.raw?.score ?? 0,
                    time: player.raw?.time ?? 0
                }))
            };

        } catch (err) {

            return {
                success: false,
                timestamp: new Date().toISOString(),
                id: server.id,
                error: err.message
            };

        }

    }

}

module.exports = QueryEngine;
