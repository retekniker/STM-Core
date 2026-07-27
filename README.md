# STM Core

Self-hosted Arma 3 server telemetry, event history and monitoring dashboards.

Current release: **v0.8.2**

## Features

- Monitors multiple Arma 3 servers through GameDig/A2S
- Tracks server status, map, latency and player count
- Detects player joins and disconnects
- Stores historical events and snapshots in SQLite
- Community dashboard
- Secured administrator dashboard
- REST API and WebSocket support

## Requirements

- Linux
- Node.js 20.17.0 or newer
- npm
- Git
- OpenSSL

## Installation

```bash
git clone https://github.com/retekniker/STM-Core.git
cd STM-Core
npm ci
```

Create the administrator token:

```bash
printf 'STM_ADMIN_TOKEN=%s\n' "$(openssl rand -hex 32)" > .env
chmod 600 .env
```

Start STM Core:

```bash
npm start
```

## Dashboards

- Community: `http://127.0.0.1:3000/community/`
- Administrator: `http://127.0.0.1:3000/community/admin/`

Display the administrator token locally:

```bash
sed -n 's/^STM_ADMIN_TOKEN=//p' .env
```

Never publish or commit the `.env` file.

## Server configuration

Servers are configured in `config/servers.json`.

## Data storage

Runtime data is stored locally in `database/stm.db`.

The database, `.env`, logs and `node_modules` are excluded from Git.

## Stop STM Core

Press `Ctrl+C` in the terminal running STM Core.

## License

No open-source license has been selected yet. All rights reserved.
