const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    JSOC_PRIORITY_CALLSIGNS,
    normalizeJsocCallsign,
    isJsocMemberName,
    isVerifiedAdminName,
    isJsocPriorityPerson,
    collectPriorityPersonnel
} = require("../dashboard/jsocPersonnel");

const dashboard = fs.readFileSync(path.join(__dirname, "../dashboard/index.html"), "utf8");

test("JSOC membership recognizes official rank prefixes and explicit clan text", () => {
    for (const name of [
        "[Pfc.] Lycoris",
        "[Pfc.] Root [77th JSOC]",
        "pilot JSOC support",
        "  [ p.F.c. ]   Lycoris  ",
        "[WO1] Example",
        "[CW.5] Example",
        "[Res.] Example"
    ]) assert.equal(isJsocMemberName(name), true, name);

    for (const tag of ["TUA", "DD", "MLAS", "NATO", "UAF", "KC"]) {
        assert.equal(isJsocMemberName(`[${tag}] Example`), false, tag);
    }
    assert.equal(isJsocMemberName("[Anything] Example"), false);
});

test("JSOC clan-member class is independent from current squad styling", () => {
    assert.match(dashboard, /if \(isClan\) rClass \+= " clan-member";\s*if \(isPriority\)/);
    assert.match(dashboard, /if \(squadDetails\) \{/);
    assert.doesNotMatch(dashboard, /else if \(isClan\)/);
});

test("priority callsigns normalize exact rank and trailing clan tags", () => {
    assert.deepEqual(JSOC_PRIORITY_CALLSIGNS, ["Knight", "MadTrap", "Alxander"]);
    for (const name of ["Knight", "[Col.] Knight", "[Col.] Knight [77th JSOC]"]) {
        assert.equal(normalizeJsocCallsign(name), "knight");
        assert.equal(isJsocPriorityPerson(name), true);
    }
    assert.equal(isJsocPriorityPerson("madtrap"), true);
    assert.equal(isJsocPriorityPerson("ALXANDER"), true);
    assert.equal(isJsocPriorityPerson("Knightmare"), false);
    assert.equal(isJsocPriorityPerson("Helpful Knight Support"), false);
});

test("displayed rank alone never verifies an administrator", () => {
    for (const rank of ["Amb.", "Cpt.", "Maj.", "Col.", "2Lt.", "1Lt.", "Lt.", "Capt.", "Gen.", "Pfc."]) {
        assert.equal(isVerifiedAdminName(`[${rank}] Seawall`), false, rank);
        assert.equal(isJsocPriorityPerson(`[${rank}] Example`), false, rank);
    }
    assert.equal(isVerifiedAdminName("[Col.] Knight"), true);
    assert.equal(isJsocPriorityPerson("MadTrap"), true);
});

test("ADMIN ON SERVER is deduplicated, sorted and follows server movement", () => {
    const initial = collectPriorityPersonnel({
        EU1: { list: [{ name: "[Col.] Knight" }, { name: "[Col.] Knight" }] },
        EU2: { list: [{ name: "Alxander" }, { name: "MadTrap" }] },
        EU3: { list: [] }
    });
    assert.deepEqual(initial.map(item => `${item.name}//${item.serverId}`), [
        "[Col.] Knight//EU1", "Alxander//EU2", "MadTrap//EU2"
    ]);
    const moved = collectPriorityPersonnel({ EU1: { list: [] }, EU2: { list: [] }, EU3: { list: [{ name: "Knight" }] } });
    assert.deepEqual(moved.map(item => item.serverId), ["EU3"]);
    assert.deepEqual(collectPriorityPersonnel({ EU1: { list: [] }, EU2: { list: [] }, EU3: { list: [] } }), []);
});

test("verified-admin display uses textContent and red-white priority styling wins", () => {
    assert.deepEqual(collectPriorityPersonnel({ EU1: { list: [{ name: "[Cpt.] Seawall" }] } }), []);
    assert.match(dashboard, /line\.textContent = `\$\{person\.name\} \/\/ \$\{person\.serverId\}`/);
    assert.match(dashboard, /\.player-row\.priority-person \.truncate/);
    assert.match(dashboard, /priority-person-flash 1\.2s steps\(1, end\) infinite !important/);
    assert.match(dashboard, /0%, 49\.99% \{ color: #ff3030/);
    assert.match(dashboard, /50%, 100% \{ color: #ffffff/);
});

test("JSOC joins welcome the player and verified admins pulse only their server frame", () => {
    assert.match(dashboard, /const isClan = isJsocMemberName\(pName\)/);
    assert.match(dashboard, /WITAMY, \$\{pName\} \/\/ JSOC UPLINK ESTABLISHED/);
    assert.match(dashboard, /player-row\.clan-member \.player-name/);
    assert.match(dashboard, /some\(player => isJsocPriorityPerson\(player\.name\)\)/);
    assert.match(dashboard, /classList\.toggle\('verified-admin-present', hasVerifiedAdmin\)/);
});
