const fs = require("fs");
const path = require("path");

const QueryEngine = require("./queryEngine");
const EventEngine = require("./eventEngine");
const StateEngine = require("./stateEngine");
const Scheduler = require("./scheduler");
const Database = require("./database");
const ApiServer = require("./api");

const configPath = path.join(
    __dirname,
    "../config/servers.json"
);

const config = JSON.parse(
    fs.readFileSync(configPath, "utf8")
);

const queryEngine = new QueryEngine();
const eventEngine = new EventEngine();
const stateEngine = new StateEngine();
const database = new Database();

const apiServer = new ApiServer({
    stateEngine,
    database,
    host: "0.0.0.0",
    port: 3000
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

        default:
            console.log(
                `${prefix} [EVENT]`,
                event
            );
    }
}

async function pollServers() {
    const results = await Promise.all(
        config.servers.map(server =>
            queryEngine.query(server)
        )
    );

    for (const result of results) {
        stateEngine.update(result);

        try {
            await database.saveSnapshot(result);
        } catch (error) {
            console.error(
                `[${getTime()}] [${result.id}] ` +
                `[DATABASE ERROR] Snapshot: ${error.message}`
            );
        }

        if (!result.success) {
            console.log(
                `[${getTime()}] [${result.id}] ` +
                `OFFLINE | ${result.error}`
            );

            continue;
        }

        console.log(
            `[${getTime()}] [${result.id}] ONLINE | ` +
            `${result.players}/${result.maxPlayers} players | ` +
            `${result.map} | ${result.ping} ms`
        );

        const events = eventEngine.process(result);

        for (const event of events) {
            printEvent(result.id, event);

            try {
                await database.saveEvent(
                    result.id,
                    event,
                    result.timestamp
                );
            } catch (error) {
                console.error(
                    `[${getTime()}] [${result.id}] ` +
                    `[DATABASE ERROR] Event: ${error.message}`
                );
            }
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

    console.log("==========================================");
    console.log("        STM CORE v0.4");
    console.log("==========================================");
    console.log(`Polling interval: ${config.pollInterval} ms`);
    console.log("SQLite database: database/stm.db");
    console.log(
        `REST API: http://${apiInfo.host}:${apiInfo.port}`
    );
    console.log("Press Ctrl+C to stop");
    console.log("");

    await scheduler.start();
}

start().catch(async error => {
    console.error(
        `[STM STARTUP ERROR] ${error.message}`
    );

    await apiServer.stop().catch(() => {});
    await database.close().catch(() => {});

    process.exit(1);
});
