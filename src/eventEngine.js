class EventEngine {

    constructor() {
        this.previous = new Map();
    }

    process(server) {

        const events = [];

        const old = this.previous.get(server.id);

        if (!old) {

            this.previous.set(server.id, structuredClone(server));

            events.push({
                type: "FIRST_SCAN",
                message: `${server.id} initial scan completed`
            });

            return events;
        }

        if (old.players !== server.players) {

            events.push({
                type: "PLAYER_COUNT_CHANGED",
                message: `${old.players} -> ${server.players}`
            });

        }

        if (old.map !== server.map) {

            events.push({
                type: "MAP_CHANGED",
                message: `${old.map} -> ${server.map}`
            });

        }

        const oldNames = new Set(
            old.playerList.map(p => p.name)
        );

        const newNames = new Set(
            server.playerList.map(p => p.name)
        );

        for (const name of newNames) {

            if (!oldNames.has(name)) {

                events.push({
                    type: "PLAYER_JOIN",
                    player: name
                });

            }

        }

        for (const name of oldNames) {

            if (!newNames.has(name)) {

                events.push({
                    type: "PLAYER_LEFT",
                    player: name
                });

            }

        }

        this.previous.set(server.id, structuredClone(server));

        return events;

    }

}

module.exports = EventEngine;
