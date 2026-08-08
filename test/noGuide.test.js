const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "dashboard/index.html"), "utf8");
const mobile = fs.readFileSync(path.join(root, "dashboard/mobile.css"), "utf8");

test("in-app Guide is completely absent without dead references", () => {
    const combined = dashboard + "\n" + mobile;
    assert.doesNotMatch(combined, /guideTrigger|guide\.css|guideContent\.js|guide\.js|stm-guide/i);
    for (const relative of [
        "dashboard/guide.css",
        "dashboard/guide.js",
        "dashboard/guideContent.js",
        "dashboard/assets/guide"
    ]) {
        assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
    }
});
