require("dotenv").config();

const fs = require("fs");
const path = require("path");

const QueryEngine = require("./queryEngine");
const EventEngine = require("./eventEngine");
const ReliabilityEngine = require("./reliabilityEngine");
const StateEngine = require("./stateEngine");
const Scheduler = require("./scheduler");
const Database = require("./database");
const ApiServer = require("./api");
const WebSocketHub = require("./websocket");
const HistoryRepository = require("./historyRepository");

const configPath = path.join(
    __dirname,
    "../config/servers.json"
);

const config = JSON.parse(
    fs.readFileSync(configPath, "utf8")
);

const queryEngine = new QueryEngine();
const eventEngine = new EventEngine();
const reliabilityEngine = new ReliabilityEngine(3);
const stateEngine = new StateEngine();
const database = new Database();
const historyRepository = new HistoryRepository(database);

const apiServer = new ApiServer({
    stateEngine,
    historyRepository,
    host: "0.0.0.0",
    port: 3000
});

const webSocketHub = new WebSocketHub({
    stateEngine,
    path: "/ws",
    heartbeatInterval: 30000
});

let shuttingDown = false;

function getTime() {
    return new Date().toLocaleTimeString("pl-PL", {
        hour12: false
    });
}

function printEvent(serverId, event) {
    const prefix = `[${getTime()}] [${serverId}]`;

    switch (event.type) {
        case "FIRST_SCAN":
            console.log(
                `${prefix} [INIT] Initial state recorded`
            );
            break;

        case "PLAYER_JOIN":
            console.log(
                `${prefix} [+] ${event.player} joined`
            );
            break;

        case "PLAYER_LEFT":
            console.log(
                `${prefix} [-] ${event.player} left`
            );
            break;

        case "PLAYER_COUNT_CHANGED":
            console.log(
                `${prefix} [COUNT] ${event.message}`
            );
            break;

        case "MAP_CHANGED":
            console.log(
                `${prefix} [MAP] ${event.message}`
            );
            break;

        case "SERVER_DEGRADED":
            console.log(
                `${prefix} [DEGRADED] ${event.message}`
            );
            break;

        case "SERVER_OFFLINE":
            console.log(
                `${prefix} [OFFLINE] ${event.message}`
            );
            break;

        case "SERVER_RECOVERED":
            console.log(
                `${prefix} [RECOVERED] ${event.message}`
            );
            break;

        case "SERVER_ONLINE":
            console.log(
                `${prefix} [ONLINE] ${event.message}`
            );
            break;

        default:
            console.log(
                `${prefix} [EVENT]`,
                event
            );
    }
}

async function saveEvent(serverId, timestamp, event) {
    printEvent(serverId, event);

    webSocketHub.broadcastEvent(
        serverId,
        event,
        timestamp
    );

    try {
        await database.saveEvent(
            serverId,
            event,
            timestamp
        );
    } catch (error) {
        console.error(
            `[${getTime()}] [${serverId}] ` +
            `[DATABASE ERROR] Event: ${error.message}`
        );
    }
}

async function pollServers() {
    const queryResults = await Promise.all(
        config.servers.map(server =>
            queryEngine.query(server)
        )
    );

    for (const queryResult of queryResults) {
        const reliabilityResult =
            reliabilityEngine.process(queryResult);

        const state = reliabilityResult.state;

        stateEngine.update(state);
        webSocketHub.broadcastServerState(state);

        try {
            await database.saveSnapshot(state);
        } catch (error) {
            console.error(
                `[${getTime()}] [${state.id}] ` +
                `[DATABASE ERROR] Snapshot: ${error.message}`
            );
        }

        if (state.status === "ONLINE") {
            console.log(
                `[${getTime()}] [${state.id}] ONLINE | ` +
                `${state.players}/${state.maxPlayers} players | ` +
                `${state.map} | ${state.ping} ms`
            );
        } else if (state.status === "DEGRADED") {
            console.log(
                `[${getTime()}] [${state.id}] DEGRADED | ` +
                `failed queries: ${state.consecutiveFailures}/3 | ` +
                `${state.lastError}`
            );
        } else {
            console.log(
                `[${getTime()}] [${state.id}] OFFLINE | ` +
                `failed queries: ${state.consecutiveFailures} | ` +
                `${state.lastError}`
            );
        }

        for (const event of reliabilityResult.events) {
            await saveEvent(
                state.id,
                state.timestamp,
                event
            );
        }

        if (!queryResult.success) {
            continue;
        }

        const serverEvents =
            eventEngine.process(queryResult);

        for (const event of serverEvents) {
            await saveEvent(
                state.id,
                state.timestamp,
                event
            );
        }
    }
}

const scheduler = new Scheduler(
    config.pollInterval,
    pollServers
);

async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log("");
    console.log(
        `[STM] Received ${signal}. Stopping services...`
    );

    scheduler.stop();

    try {
        await webSocketHub.stop();
        console.log("[STM] WebSocket stopped");
    } catch (error) {
        console.error(
            `[STM] WebSocket stop error: ${error.message}`
        );
    }

    try {
        await apiServer.stop();
        console.log("[STM] API server stopped");
    } catch (error) {
        console.error(
            `[STM] API stop error: ${error.message}`
        );
    }

    try {
        await database.close();
        console.log("[STM] Database closed");
    } catch (error) {
        console.error(
            `[STM] Database close error: ${error.message}`
        );
    }

    process.exit(0);
}

process.on(
    "SIGINT",
    () => void shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => void shutdown("SIGTERM")
);

async function start() {
    await database.init();

    const apiInfo = await apiServer.start();

    webSocketHub.start(apiServer.server);

    console.log("==========================================");
    console.log("        STM CORE v0.8.2");
    console.log("==========================================");
    console.log(`Polling interval: ${config.pollInterval} ms`);
    console.log("Offline threshold: 3 failed queries");
    console.log("SQLite database: database/stm.db");
    console.log(
        `REST API: http://${apiInfo.host}:${apiInfo.port}`
    );
    console.log(
        `WebSocket: ws://127.0.0.1:${apiInfo.port}/ws`
    );
    console.log("Press Ctrl+C to stop");
    console.log("");

    await scheduler.start();
}

start().catch(async error => {
    console.error(
        `[STM STARTUP ERROR] ${error.message}`
    );

    await webSocketHub.stop().catch(() => {});
    await apiServer.stop().catch(() => {});
    await database.close().catch(() => {});

    process.exit(1);
});
