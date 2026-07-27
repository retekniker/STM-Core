const fs = require("fs");
const path = require("path");

const QueryEngine = require("./queryEngine");
const EventEngine = require("./eventEngine");
const StateEngine = require("./stateEngine");
const Scheduler = require("./scheduler");

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

function getTime() {
    return new Date().toLocaleTimeString(
        "pl-PL",
        {
            hour12: false
        }
    );
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

        if (!result.success) {

            console.log(
                `[${getTime()}] [${result.id}] OFFLINE | ${result.error}`
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
        }
    }
}

const scheduler = new Scheduler(
    config.pollInterval,
    pollServers
);

function shutdown(signal) {

    console.log("");
    console.log(
        `[STM] Received ${signal}. Stopping scheduler...`
    );

    scheduler.stop();
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("==========================================");
console.log("        STM CORE v0.2");
console.log("==========================================");
console.log(`Polling interval: ${config.pollInterval} ms`);
console.log("Press Ctrl+C to stop");
console.log("");

scheduler.start().catch(error => {

    console.error(
        `[STM STARTUP ERROR] ${error.message}`
    );

    process.exit(1);
});
