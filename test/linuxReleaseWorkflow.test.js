"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Linux release workflow builds portable native dependencies for an exact tag", () => {
    const workflow = fs.readFileSync(
        path.join(__dirname, "../.github/workflows/build-linux.yml"),
        "utf8"
    );

    assert.match(workflow, /runs-on: ubuntu-22\.04/);
    assert.match(workflow, /workflow_dispatch:[\s\S]*release_tag:/);
    assert.match(workflow, /npm_config_build_from_source: "true"/);
    assert.match(workflow, /git describe --tags --exact-match HEAD/);
    assert.match(workflow, /env -u GITHUB_SHA tools\/buildLinuxRelease\.sh/);
    assert.match(workflow, /gh release upload "\$\{RELEASE_TAG\}"/);
});
