const {
    WebSocketServer,
    WebSocket
} = require("ws");

class WebSocketHub {

    constructor(options = {}) {
        this.stateEngine = options.stateEngine || null;
        this.path = options.path || "/ws";
        this.heartbeatInterval =
            options.heartbeatInterval || 30000;

        this.server = null;
        this.heartbeatTimer = null;
    }

    start(httpServer) {
        if (!httpServer) {
            throw new Error(
                "WebSocketHub requires an HTTP server"
            );
        }

        if (this.server) {
            return;
        }

        this.server = new WebSocketServer({
            server: httpServer,
            path: this.path
        });

        this.server.on(
            "connection",
            (client, request) => {
                this.handleConnection(client, request);
            }
        );

        this.server.on("error", error => {
            console.error(
                `[WEBSOCKET ERROR] ${error.message}`
            );
        });

        this.startHeartbeat();
    }

    handleConnection(client, request) {
        client.isAlive = true;

        client.on("pong", () => {
            client.isAlive = true;
        });

        client.on("message", data => {
            this.handleMessage(client, data);
        });

        client.on("error", error => {
            console.error(
                `[WEBSOCKET CLIENT ERROR] ${error.message}`
            );
        });

        this.send(client, {
            type: "CONNECTED",
            timestamp: new Date().toISOString(),
            path: request.url
        });

        if (this.stateEngine) {
            this.send(client, {
                type: "SERVERS_SNAPSHOT",
                timestamp: new Date().toISOString(),
                servers: this.stateEngine.getAll()
            });
        }
    }

    handleMessage(client, data) {
        let message;

        try {
            message = JSON.parse(data.toString());
        } catch {
            this.send(client, {
                type: "ERROR",
                error: "INVALID_JSON",
                timestamp: new Date().toISOString()
            });

            return;
        }

        if (message.type === "PING") {
            this.send(client, {
                type: "PONG",
                timestamp: new Date().toISOString()
            });
        }
    }

    send(client, message) {
        if (client.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            client.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(
                `[WEBSOCKET SEND ERROR] ${error.message}`
            );

            return false;
        }
    }

    broadcast(message) {
        if (!this.server) {
            return 0;
        }

        let sent = 0;

        for (const client of this.server.clients) {
            if (this.send(client, message)) {
                sent += 1;
            }
        }

        return sent;
    }

    broadcastServerState(serverState) {
        return this.broadcast({
            type: "SERVER_STATE",
            timestamp:
                serverState.timestamp ||
                new Date().toISOString(),
            server: serverState
        });
    }

    broadcastEvent(serverId, event, timestamp = null) {
        return this.broadcast({
            type: "SERVER_EVENT",
            timestamp:
                timestamp || new Date().toISOString(),
            serverId,
            event
        });
    }

    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (!this.server) {
                return;
            }

            for (const client of this.server.clients) {
                if (client.isAlive === false) {
                    client.terminate();
                    continue;
                }

                client.isAlive = false;
                client.ping();
            }
        }, this.heartbeatInterval);
    }

    async stop() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (!this.server) {
            return;
        }

        for (const client of this.server.clients) {
            client.close(
                1001,
                "STM Core shutting down"
            );
        }

        await new Promise((resolve, reject) => {
            this.server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        this.server = null;
    }

}

module.exports = WebSocketHub;
