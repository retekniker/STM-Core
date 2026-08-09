<p align="center">
  <img src="dashboard/assets/jsoc-logo.png" alt="77th JSOC" width="420">
</p>

# STM Core

Self-hosted Arma 3 server telemetry, event history and monitoring dashboard for **Linux and Windows**.

**Latest stable release: v0.8.17**

v0.8.17 restores the first-start `INIT.COM` attention signal, expands Activity Feed Zoom,
adds a clock-to-Restart-Prediction display cycle, tightens verified-administrator alerts,
restores JSOC player emphasis and welcomes, and adds a bounded seven-day Telemetry
Inspector range. v0.8.16 introduced the local Windows app-mode/tray experience,
per-device remembered chart ranges, seven-day Active Personnel History, clearer
Activity Feed and Restart Log controls, responsive dashboard sizing and the
installable mobile PWA. See [CHANGELOG.md](CHANGELOG.md) for the full release
history.

[![Downloads](https://img.shields.io/github/downloads/retekniker/STM-Core/total?style=for-the-badge&logo=github&label=Downloads)](https://github.com/retekniker/STM-Core/releases)

STM Core monitors Arma 3 servers directly through GameDig/A2S without depending on BattleMetrics. It runs locally in the background, stores historical data in SQLite and provides a browser-based community dashboard.

## Features

- Monitors multiple Arma 3 servers
- Tracks server status, map, latency and player count
- Displays current player lists
- Recognizes 77th JSOC members by official rank prefixes and clan identifiers, pulses their names and shows a DMD welcome when they join
- Shows `ADMIN ON SERVER` and a subtle white-red server-frame pulse only for explicitly verified administrator callsigns; a displayed rank alone is never sufficient
- Shows readable restart flags with enlarged hover targets on telemetry charts
- Opens Activity Feed in a large responsive inspector with the same live entries and Restart Log
- Separates Activity Feed and Restart Log clearing while preserving telemetry, restart markers, uptime and chart history
- Provides locally remembered chart ranges, including seven-day Active Personnel History and seven-day enlarged server telemetry
- Cycles each EU server clock through elapsed time, restart time and a DMD-style Restart Prediction view
- Draws attention to `INIT.COM` while first-start voice communications remain in standby
- Detects player joins and disconnects
- Detects server restarts through Steam ID rotation
- Detects confirmed offline-to-online restart cycles
- Stores restart events, server events and snapshots in SQLite
- Restores restart clocks after STM Core is restarted
- Hydrates each Watchdog from exact confirmed SQLite restart history when the latest restart is less than eight hours old, without creating a restart event
- Continues monitoring after the browser is closed
- Provides live dashboard updates through REST API and WebSocket
- Windows system tray controller, optional autostart and maximized browser app-mode dashboard (Chrome or Edge, with a normal-browser fallback)
- Linux background service through systemd
- Installable mobile PWA for supported Android and iOS browsers when served from a trusted HTTPS origin
- Responsive dashboard sizing for desktops, laptops, tablets and phones
- Local configuration and data storage

## Windows installation

Download the latest Windows installer:

**https://github.com/retekniker/STM-Core/releases/latest**

Run the downloaded installer:

v0.8.17 release asset:

`STM-Core-Setup-0.8.17-x64.exe`

Installing a newer version over an existing installation preserves the database and configuration.

The Windows system tray icon provides:

- Open Dashboard
- Start STM Core
- Stop STM Core
- Restart STM Core
- Start with Windows
- Current running status
- Exit STM Core

Opening STM Core from the installer, an optional desktop/Start Menu shortcut, or
the tray uses the same local dashboard. Closing that window does not stop the tray
or the local collector.

## Linux installation

Self-contained v0.8.17 release assets:

- `STM-Core-0.8.17-linux-x64.tar.gz`
- `STM-Core-0.8.17-linux-x64.tar.gz.sha256`

Install or update STM Core with:

```bash
curl -fsSL https://raw.githubusercontent.com/retekniker/STM-Core/main/install.sh | bash
```

The bootstrap resolves the latest published stable GitHub release, verifies its
SHA-256 checksum and then runs the installer bundled in that release. It never
installs application code directly from `main`.

To install a specific published stable release:

```bash
curl -fsSL https://raw.githubusercontent.com/retekniker/STM-Core/main/install.sh | bash -s -- --version v0.8.17
```

Downgrading may require a matching database backup because database downgrade
compatibility is not guaranteed.

After installation, open STM Core from the application menu or run:

```bash
stm-core open
```

Available commands:

```bash
stm-core open
stm-core start
stm-core stop
stm-core restart
stm-core status
stm-core logs
```

The Linux version runs as a systemd user service and continues monitoring after the browser is closed.

Running the installer again updates STM Core while preserving the existing configuration and database.

## Dashboard

Open the community dashboard at:

```text
http://127.0.0.1:3000/community/
```

The dashboard displays live server status, connected players, restart clocks, activity events and voice notifications.

Browser-based voice notifications must be enabled from the dashboard after opening the page.

## Mobile PWA

STM Core includes a responsive Progressive Web App manifest, icons and a safe
offline shell. On a supported phone or tablet, open the `/community/` dashboard
from a trusted HTTPS address, sign in if the hosting environment requires it, and
choose the browser's **Install app** or **Add to Home Screen** command.

The PWA is a view of the STM Core instance that serves it. Continuous collection
and historical storage remain on that STM Core computer or server; the phone does
not need to stay open. STM Core does not publish a private installation to the
internet automatically.

## Run from source

Requirements:

- Node.js 18 or newer
- npm
- Git

Clone and install:

```bash
git clone https://github.com/retekniker/STM-Core.git
cd STM-Core
npm ci
npm start
```

Then open:

```text
http://127.0.0.1:3000/community/
```

## Server configuration

Monitored servers are configured in:

```text
config/servers.json
```

Each server entry contains its identifier, display name, address and query port.

## Data storage

STM Core stores runtime data locally in SQLite.

Default project database:

```text
database/stm.db
```

Windows application data:

```text
%LOCALAPPDATA%\STM-Core
```

Linux installation directory:

```text
~/.local/share/stm-core
```

The database contains server snapshots, detected events and restart history.

Runtime databases, environment files, logs and installed dependencies are excluded from Git.

## Background monitoring

STM Core operates independently from the browser.

Closing the dashboard does not stop monitoring. Server polling, restart detection and event storage continue in the background as long as STM Core is running and the computer is not turned off or suspended.

## Updating

### Windows

Download the newest installer from:

**https://github.com/retekniker/STM-Core/releases/latest**

Install it over the existing version.

### Linux

Run:

```bash
curl -fsSL https://raw.githubusercontent.com/retekniker/STM-Core/main/install.sh | bash
```

Existing data and configuration are preserved during updates.

## Project status

STM Core is the current actively maintained successor to the original browser-only STM dashboard.

The legacy version was archived because changes introduced by BattleMetrics made its previous monitoring method unreliable.

## License

No open-source license has been selected.

All rights reserved.
