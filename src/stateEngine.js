class StateEngine {

    constructor() {
        this.servers = new Map();
    }

    update(serverState) {

        if (!serverState || !serverState.id) {
            throw new Error("Server state must contain an id");
        }

        this.servers.set(
            serverState.id,
            structuredClone(serverState)
        );

        return this.get(serverState.id);
    }

    get(serverId) {

        const state = this.servers.get(serverId);

        if (!state) {
            return null;
        }

        return structuredClone(state);
    }

    getAll() {

        return Array.from(
            this.servers.values(),
            state => structuredClone(state)
        );
    }

    has(serverId) {
        return this.servers.has(serverId);
    }

    remove(serverId) {
        return this.servers.delete(serverId);
    }

    clear() {
        this.servers.clear();
    }

}

module.exports = StateEngine;
