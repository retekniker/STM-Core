const { GameDig } = require('gamedig');

async function probe() {
    console.clear();

    console.log("========================================");
    console.log("      STM PROBE v0.1");
    console.log("========================================\n");

    try {

        const state = await GameDig.query({
            type: "arma3",
            host: "213.239.205.71",
            port: 2302,
            socketTimeout: 5000,
            maxAttempts: 2
        });

        console.log("STATUS      : ONLINE");
        console.log("NAME        :", state.name);
        console.log("MAP         :", state.map);
        console.log("PLAYERS     :", `${state.players.length}/${state.maxplayers}`);
        console.log("PASSWORD    :", state.password);
        console.log("PING        :", state.ping ?? "N/A");

        console.log("\n============== PLAYERS ==============\n");

        if (!state.players || state.players.length === 0) {
            console.log("No player list returned.");
        } else {
            state.players.forEach((player, index) => {
                console.log(`${index + 1}. ${player.name}`);
            });
        }

        console.log("\n============== RAW DATA ==============\n");
        console.dir(state, { depth: null, colors: true });

    }
    catch (err) {

        console.log("STATUS : ERROR\n");

        console.error(err);

    }

}

probe();
