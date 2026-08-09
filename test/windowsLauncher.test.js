const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const controller = fs.readFileSync(path.join(root, "windows/stm-core.ps1"), "utf8");
const tray = fs.readFileSync(path.join(root, "windows/stm-core-tray.ps1"), "utf8");
const installer = fs.readFileSync(path.join(root, "windows/STM-Core.iss"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/build-windows.yml"), "utf8");

test("Windows dashboard opens in maximized browser app mode with a safe fallback", () => {
    const chrome = controller.indexOf("Google\\Chrome\\Application\\chrome.exe");
    const edge = controller.indexOf("Microsoft\\Edge\\Application\\msedge.exe");
    assert.ok(chrome >= 0 && edge > chrome);
    assert.match(controller, /"--app=\$DashboardUrl"/);
    assert.match(controller, /"--start-maximized"/);
    assert.match(controller, /function Open-STMDashboard/);
    assert.match(controller, /Start-Process \$DashboardUrl/);
    assert.match(controller, /Start-STMCore\s+Open-STMDashboard/);
    assert.doesNotMatch(controller, /--kiosk|--start-fullscreen/);
});

test("tray remains independent and uses the STM Core icon", () => {
    assert.match(tray, /Invoke-STMCore "open"/);
    assert.match(tray, /assets\\stm-core\.ico/);
    assert.match(tray, /Invoke-STMCore "start"/);
    assert.match(tray, /\[System\.Windows\.Forms\.Application\]::Run/);
});

test("installer keeps optional shortcuts and package version as its source", () => {
    assert.match(installer, /SetupIconFile=assets\\stm-core\.ico/);
    assert.match(installer, /WizardImageFile=assets\\retek-wizard\.bmp/);
    assert.match(installer, /WelcomeLabel1=Welcome to the STM Core \{#MyAppVersion\} Setup Wizard/);
    assert.match(installer, /Name: "startmenuicon"/);
    assert.match(installer, /Tasks: startmenuicon/);
    assert.match(installer, /Flags: unchecked/);
    assert.equal((installer.match(/IconFilename: "\{app\}\\windows\\assets\\stm-core\.ico"/g) || []).length, 2);
    assert.doesNotMatch(installer, /#define MyAppVersion "\d/);
    assert.match(workflow, /ConvertFrom-Json\)\.version/);
    assert.match(workflow, /Copy-Item "windows\/assets"/);
});

test("Windows icon resources have valid dimensions and signatures", () => {
    const icon = fs.readFileSync(path.join(root, "windows/assets/stm-core.ico"));
    const wizard = fs.readFileSync(path.join(root, "windows/assets/retek-wizard.bmp"));
    assert.deepEqual(Array.from(icon.subarray(0, 4)), [0, 0, 1, 0]);
    assert.equal(wizard.subarray(0, 2).toString("ascii"), "BM");
    assert.equal(wizard.readInt32LE(18), 240);
    assert.equal(Math.abs(wizard.readInt32LE(22)), 459);
});
