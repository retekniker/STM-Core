const fs = require("fs");
const path = require("path");

const QueryEngine = require("./queryEngine");

async function main() {

    console.clear();

    console.log("==========================================");
    console.log("        STM CORE v0.1");
    console.log("==========================================");
    console.log("");

    const configPath = path.join(__dirname, "../config/servers.json");

    const config = JSON.parse(
        fs.readFileSync(configPath, "utf8")
    );

    const engine = new QueryEngine();

    for (const server of config.servers) {

        console.log("------------------------------------------");
        console.log(`Checking ${server.id}`);
        console.log("------------------------------------------");

        const result = await engine.query(server);

        if (!result.success) {

            console.log("STATUS : OFFLINE");
            console.log(result.error);
            console.log("");

            continue;

        }

        console.log("STATUS      : ONLINE");
        console.log("SERVER      :", result.name);
        console.log("MAP         :", result.map);
        console.log("VERSION     :", result.version);
        console.log("PLAYERS     :", `${result.players}/${result.maxPlayers}`);
        console.log("PING        :", result.ping + " ms");
        console.log("STEAM ID    :", result.steamId);
        console.log("QUERY PORT  :", result.queryPort);

        console.log("");
        console.log("PLAYERS");
        console.log("------------------------------------------");

        if (result.playerList.length === 0) {

            console.log("No players");

        } else {

            result.playerList.forEach((player, index) => {

                console.log(
                    `${index + 1}. ${player.name} | Score: ${player.score} | Time: ${Math.floor(player.time)} sec`
                );

            });

        }

        console.log("");

    }

}

main();
