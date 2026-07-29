(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const JSOC_RANKS = new Set([
        "amb", "wo", "wo1", "wo2", "wo3", "wo4", "wo5",
        "cw1", "cw2", "cw3", "cw4", "cw5", "pvt", "pfc", "spc",
        "cpl", "sgt", "ssgt", "ssg", "sfc", "2lt", "1lt", "lt",
        "cpt", "capt", "maj", "col", "gen", "res"
    ]);
    const PRIORITY_RANKS = new Set([
        "amb", "2lt", "1lt", "lt", "cpt", "capt", "maj", "col", "gen"
    ]);

    // Publicly confirmed initial High Command list. Keep future callsign updates here.
    const JSOC_PRIORITY_CALLSIGNS = Object.freeze([
        "Knight",
        "MadTrap",
        "Alxander"
    ]);
    const PRIORITY_CALLSIGN_KEYS = new Set(
        JSOC_PRIORITY_CALLSIGNS.map(name => name.toLocaleLowerCase("en-US"))
    );

    function rankKey(value) {
        return String(value || "").toLocaleLowerCase("en-US").replace(/[.\s]/g, "");
    }

    function parseJsocRankPrefix(playerName) {
        const match = String(playerName || "").match(/^\s*\[\s*([^\]]+?)\s*\]\s*/);
        if (!match) return null;
        const key = rankKey(match[1]);
        return JSOC_RANKS.has(key) ? { key, text: match[0] } : null;
    }

    function isJsocMemberName(playerName) {
        const value = String(playerName || "");
        return /(?:^|\W)77th(?:\W|$)/i.test(value)
            || /(?:^|\W)JSOC(?:\W|$)/i.test(value)
            || Boolean(parseJsocRankPrefix(value));
    }

    function normalizeJsocCallsign(playerName) {
        let value = String(playerName || "");
        const rank = parseJsocRankPrefix(value);
        if (rank) value = value.slice(rank.text.length);
        value = value.replace(/\s*\[\s*77th\s+JSOC\s*\]\s*$/i, "");
        return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
    }

    function isJsocPriorityPerson(playerName) {
        const rank = parseJsocRankPrefix(playerName);
        if (rank && PRIORITY_RANKS.has(rank.key)) return true;
        return PRIORITY_CALLSIGN_KEYS.has(normalizeJsocCallsign(playerName));
    }

    function collectPriorityPersonnel(serverCaches, serverOrder = ["EU1", "EU2", "EU3"]) {
        const entries = [];
        serverOrder.forEach((serverId, serverIndex) => {
            const seen = new Set();
            const players = serverCaches?.[serverId]?.list || [];
            players.forEach(player => {
                const name = String(player?.name || "").trim();
                if (!name || !isJsocPriorityPerson(name)) return;
                const key = normalizeJsocCallsign(name);
                if (seen.has(key)) return;
                seen.add(key);
                entries.push({ serverId, serverIndex, name, key });
            });
        });
        return entries.sort((left, right) =>
            left.serverIndex - right.serverIndex
            || left.name.localeCompare(right.name, "en", { sensitivity: "base" })
            || left.name.localeCompare(right.name, "en")
        );
    }

    return {
        JSOC_PRIORITY_CALLSIGNS,
        parseJsocRankPrefix,
        normalizeJsocCallsign,
        isJsocMemberName,
        isJsocPriorityPerson,
        collectPriorityPersonnel
    };
});
