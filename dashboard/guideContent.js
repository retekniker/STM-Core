(function () {
    "use strict";

    const standard = (purpose, controls, how, persistence, safety, image, callouts, notes = []) => ({
        purpose, controls, how, persistence, safety, image, callouts, notes
    });

    window.STM_GUIDE_CONTENT = Object.freeze({
        version: "0.8.14",
        title: "STM FIELD MANUAL",
        chapters: [
            { id: "quick-start", number: "01", title: "QUICK START", ...standard(
                "Orient an operator to STM-Core and its three monitored server channels.",
                ["GUIDE [?] opens this manual.", "EU1, EU2 and EU3 identify configured monitor slots; they are labels, not universal host names."],
                ["STM-Core queries the servers configured for its own backend and streams the resulting state to connected dashboards.", "Green/cyan normally denotes healthy or live data, amber denotes analysis or approximation, and red denotes offline, stopped, or alert state.", "Read ONLINE/OFFLINE on each server panel. The footer identifies the application version and Health; `/api/v1/community/health` is the direct backend check."],
                "Telemetry and shared Activity Feed state belong to the STM backend and its SQLite database. Browser preferences and squad rosters are local to a browser profile. A central dashboard and a separate local installation do not share a database.",
                "IMPORTANT: Use the URL assigned to your installation. A private deployment address is not a universal STM address.",
                "assets/guide/01-quick-start.png",
                ["Header and communication controls", "EU server panels", "Version and Health"]
            )},
            { id: "voice-comms", number: "02", title: "VOICE COMMS", ...standard(
                "Enable browser speech and alert audio after a user gesture.",
                ["INIT COMM / VOICE: ON/OFF toggles voice announcements.", "TEST queues an audio check and a server-down speech sample when voice is on; otherwise it plays alert tones.", "Mute and volume controls affect the current browser."],
                ["The initial AUDIO LOCKED state is deliberate. Click INIT COMM to satisfy browser autoplay policy, request notification permission when available, and unlock speech synthesis.", "VOICE: OFF cancels queued speech and audio. Click it again, then TEST, to retry communication.", "Speech availability, installed voices, background-tab behavior, and autoplay restrictions are controlled by the browser and operating system."],
                "Voice, mute, volume, and the audio queue are browser-side. Mute and volume survive reload through localStorage; voice activation itself does not and must be re-enabled after reload.",
                "NOTE: A successful visual COMM-LINK state cannot guarantee that the operating system speech service will produce sound. The queue watchdog abandons a stalled utterance after 15 seconds.",
                "assets/guide/02-voice-comms.png",
                ["AUDIO LOCKED before activation", "INIT COMM / VOICE toggle", "TEST and volume controls"]
            )},
            { id: "server-panels", number: "03", title: "SERVER PANELS & OPERATORS", ...standard(
                "Read current server health, map, latency, capacity, and operator sessions.",
                ["EU1/EU2/EU3 panels show status and roster.", "Double-clicking a player row adds that player to the selected squad.", "SORT changes only the squad roster ordering."],
                ["OPR is the current player count, AO is the reported map/area of operations, and LAT is measured query latency.", "Each live player row shows current-session time derived from the backend observation. Lists refresh from live queries; ONLINE and OFFLINE reflect the latest backend result."],
                "Live server state is backend-global but transient. Historical telemetry is written to SQLite. Browser display ordering is local.",
                "NOTE: A query failure can temporarily produce an offline or degraded state; use Health and SYS-LOG before concluding that the game host is down.",
                "assets/guide/03-server-panels.png",
                ["Server identity and ONLINE state", "OPR, AO and LAT", "Player list and session time"]
            )},
            { id: "squad-tracking", number: "04", title: "SQUAD TRACKING", ...standard(
                "Maintain local, color-coded watch squads and compare them with active server rosters.",
                ["Squad selector chooses ALFA–GOLF or FAV.", "SORT cycles ADDED, A-Z, and ONLINE.", "STATS toggles session and accumulated browser history.", "AUTO-FAV adds newly observed unassigned joiners to FAV while enabled.", "ADD inserts the typed callsign; double-clicking an active player does the same.", "DRAFT UNLINKED adds active players not present in any squad until capacity is reached.", "PURGE empties only the selected squad."],
                ["A callsign can exist in only one squad. ADD rejects duplicates and full rosters (11 for ALFA–GOLF, 210 for FAV). Remove an entry with its X before assigning it elsewhere.", "Current server session time and persistent local total time are different counters. STATS only changes presentation.", "AUTO-FAV does not retroactively import all currently connected users; DRAFT UNLINKED performs that explicit scan."],
                "Squads, selected squad, sorting, and accumulated statistics use this browser's localStorage. SORT survives reload; STATS and AUTO-FAV reset on reload. None of these values is synchronized by the backend.",
                "CAUTION: PURGE immediately clears the selected local squad without confirmation. It does not kick players, alter server membership, or erase telemetry/database history.",
                "assets/guide/04-squad-tracking.png",
                ["Squad selector and mode controls", "Linked operators", "Unlinked active operator", "ADD, DRAFT UNLINKED and PURGE"]
            )},
            { id: "activity-feed", number: "05", title: "ACTIVITY FEED & RESTART LOG", ...standard(
                "Inspect live joins, leaves, system messages, and confirmed restart evidence.",
                ["X removes one visible feed entry.", "Click the panel or ZOOM to open the inspector; RESTORE/CLOSE returns to the dashboard.", "Restart Log switches the inspector to persisted restart evidence.", "CLEAR ALL opens a YES/NO confirmation."],
                ["The feed updates live and retains its own scroll position. The expanded inspector uses the same current entries.", "YES on CLEAR ALL writes a durable backend cutoff and broadcasts it to clients using that same STM backend. Old activity entries stay hidden; new entries after the cutoff appear normally.", "CLEAR ALL does not delete telemetry samples, server uptime, restart records, restart flags, or an independent STM installation's data."],
                "Activity events and the clear cutoff are stored in SQLite and survive reload/restart. Inspector size/mode is UI state. Connected clients on one backend receive WebSocket synchronization.",
                "CAUTION: CLEAR ALL permanently hides the prior Activity Feed history for that backend. Choose NO to cancel.",
                "assets/guide/05-activity-feed.png",
                ["Normal Activity Feed", "ZOOM and Restart Log", "Expanded inspector", "CLEAR ALL YES/NO warning"]
            )},
            { id: "watchdog", number: "06", title: "WATCHDOG: OFF / AUTO / ON", ...standard(
                "Control restart-monitoring sensitivity per server.",
                ["OFF disables restart analysis for that server.", "AUTO analyzes a cold-start baseline and changes to ON after its 24-hour calibration deadline.", "ON performs full restart evaluation and alerts."],
                ["A state button takes effect on one click. The backend supplies a monitoring-session ID; browser state is restored only while that backend session remains the same.", "Restart detection compares server identity and query/roster/session evidence. Transitional identifiers are rejected until evidence confirms a restart.", "At cold start, AUTO establishes a quarantine/baseline rather than declaring historical changes as new restarts. Confirmed events update lastRestartAt, restart evidence, visual state, feed entries, flags, and eligible voice alerts."],
                "The chosen mode and client restart clock are cached locally for the current backend monitoring session. Confirmed restart events, server baselines, and lastRestartAt are backend/SQLite state and survive an STM-Core process restart. A new backend session resets client manual modes to AUTO.",
                "IMPORTANT: OFF suppresses analysis; it does not stop server polling or erase existing telemetry and restart history.",
                "assets/guide/06-watchdog.png",
                ["OFF state", "AUTO calibration/analysis", "ON monitoring", "Restart state and baseline"]
            )},
            { id: "telemetry-history", number: "07", title: "TELEMETRY HISTORY", ...standard(
                "Review recent player load and latency from persisted samples.",
                ["30 MIN, 2 H, 6 H, and 12 H select the mini-chart window.", "Hover a sample for its timestamp and values.", "Click a mini-chart to open Telemetry Inspector."],
                ["Players is the yellow filled series. Ping is a thin line using the server color and an independently scaled axis.", "The backend writes samples to SQLite, so history continues while a browser is closed as long as STM-Core keeps running.", "A separate local STM installation records its own history; it does not inherit a central installation's database."],
                "Range preference is localStorage. Samples are backend SQLite data and survive browser reload and normal STM-Core restarts.",
                "NOTE: Empty charts on a fresh database are not proof of data loss. Allow the backend to collect samples and verify Health.",
                "assets/guide/07-telemetry-history.png",
                ["Time-range selector", "Players fill", "Ping line", "Sample tooltip"]
            )},
            { id: "telemetry-inspector", number: "08", title: "OSCILLOSCOPES & TELEMETRY INSPECTOR", ...standard(
                "Inspect long-range telemetry and restart context with precise navigation.",
                ["Choose EU1/EU2/EU3 and 30 MIN through 48 H.", "Toggle Players, Max Slots, and Ping.", "Drag/pan the navigator or handles to change the visible range.", "PREVIOUS RESTART and NEXT RESTART step between markers; LIVE follows the newest data; RESET VIEW restores the range."],
                ["Players/Max Slots use the left axis and Ping the right axis. Tooltips report timestamps and values.", "Source samples is the fetched set; visible samples is the subset inside the current window.", "EXACT TIME UNKNOWN marks a restart known only to have occurred inside an observation gap. Gaps are intentionally broken rather than connected by a misleading line."],
                "Inspector navigation is temporary UI state. Telemetry and confirmed restart markers come from backend SQLite.",
                "NOTE: PREVIOUS/NEXT can land on clustered markers. Use the larger marker hitbox and tooltip to distinguish them.",
                "assets/guide/08-telemetry-inspector.png",
                ["Server/range toolbar", "Dual-axis chart and tooltip", "Restart controls", "Navigator and sample counts", "EXACT TIME UNKNOWN gap"]
            )},
            { id: "restart-flags", number: "09", title: "RESTART FLAGS", ...standard(
                "Locate confirmed restart events on telemetry timelines.",
                ["Hover or focus a RESTART flag/diamond for timestamp and evidence details.", "Use inspector restart navigation when several markers are close together."],
                ["A marker combines a vertical line, diamond, RESTART label, and date/time. Its interaction hitbox is wider than the visible line.", "Mini-charts show compact markers; Inspector exposes detailed hover information and unknown-time windows."],
                "Restart flags are rendered from persisted backend restart records and survive reload and backend restart.",
                "IMPORTANT: Activity Feed CLEAR ALL changes only the feed cutoff. It does not delete the restart records that generate these flags.",
                "assets/guide/09-restart-flags.png",
                ["Vertical restart line", "Diamond and RESTART flag", "Date/time tooltip", "Clustered marker hit areas"]
            )},
            { id: "asset-saturation", number: "10", title: "ASSET SATURATION", ...standard(
                "Compare slot utilization across monitored servers.",
                ["EU1/EU2/EU3 rows show current utilization and ONLINE/OFFLINE.", "TOTAL summarizes current players against total available slots.", "The combined chart shows utilization changing over time."],
                ["Percentage is current players divided by reported max slots. Bars and status colors update from live samples.", "The chart represents player-slot saturation only. It is not CPU, RAM, network bandwidth, mission load, or proof of queue length."],
                "Current values are live backend state; the time series derives from stored telemetry samples.",
                "NOTE: An offline server may have no meaningful current percentage; read its status before comparing bars.",
                "assets/guide/10-asset-saturation.png",
                ["Per-server utilization", "TOTAL capacity", "ONLINE/OFFLINE labels", "Combined history chart"]
            )},
            { id: "admin-jsoc", number: "11", title: "ADMIN ON SERVER & JSOC MARKERS", ...standard(
                "Highlight locally classified personnel in active rosters.",
                ["Recognized 77th JSOC member names pulse normally.", "Priority personnel flash red/white and produce ADMIN ON SERVER with the matching server."],
                ["Classification uses controlled rank/name and callsign patterns in `dashboard/jsocPersonnel.js`. The alert is deduplicated, sorted, and follows movement between EU servers.", "A2S player data does not expose actual administrator permissions. ADMIN ON SERVER is therefore a local naming classification, not cryptographic identity or authorization proof.", "Update `PRIORITY_PERSONNEL` in `dashboard/jsocPersonnel.js` to maintain the controlled priority list."],
                "Classification code ships with the dashboard; detected presence is recomputed from each live roster and is not an authorization record.",
                "IMPORTANT: Never use this marker as the sole basis for access-control or disciplinary decisions.",
                "assets/guide/11-admin-jsoc.png",
                ["Standard JSOC pulse", "Priority red/white flash", "ADMIN ON SERVER and server label"]
            )},
            { id: "clock-override", number: "12", title: "CLOCK & MANUAL OVERRIDE", ...standard(
                "Read confirmed uptime/restart time and temporarily inspect the approximate alternate view.",
                ["Single-click a server clock to toggle elapsed uptime and the APRX restart-time view.", "Double-click the telemetry chart resets its view; v0.8.14 has no active manual time-injection prompt in the server clock handler."],
                ["The header clock shows local wall time. Server clocks derive from backend core uptime/lastRestartAt and update each second.", "The APRX badge identifies the alternate calculated display, not a new confirmed restart. Backend restart evidence mathematically establishes confirmed time; unknown observation gaps remain explicitly approximate."],
                "Clock display mode is in-memory browser state and resets on reload. Confirmed restart time and uptime are backend state.",
                "IMPORTANT: The legacy Guide claimed double-click manual time injection. The current v0.8.14 clock code implements only a single-click display toggle; do not treat APRX as persisted evidence.",
                "assets/guide/12-clock-override.png",
                ["Header clock", "Elapsed/countdown display", "Single-click APRX view", "Confirmed restart reference"]
            )},
            { id: "backup-database", number: "13", title: "BACKUP, RESTORE & DATABASE", ...standard(
                "Export and recover browser-held operator configuration separately from backend SQLite.",
                ["AUTO-BACKUP toggles a 48-hour timer in this open browser tab.", "SYS BACKUP downloads an operator text export and a JSON state backup.", "RESTORE imports the JSON keys and reloads the page.", "MEM RESET removes listed STM localStorage keys after confirmation.", "ADV enables extra browser log entries; DB exports operator statistics; COPY copies visible SYS-LOG text; LOG identifies the SYS-LOG panel."],
                ["The JSON includes local stats, squads, watchdog/display state, approximate state, radar mode, and selected squad. The DB button exports operator statistics as text; neither export is the backend SQLite database file.", "RESTORE parses JSON and writes recognized keys, then reloads. Invalid JSON is rejected, but there is no transactional rollback of already accepted browser state.", "AUTO-BACKUP runs only while the page and its one-second worker are active; enabling it starts a fresh 48-hour interval."],
                "Browser settings and roster data persist in localStorage. Telemetry, feed cutoff, and restart evidence persist separately in `database/stm.db` on the backend. Downloads persist wherever the browser saves them.",
                "CAUTION: RESTORE overwrites recognized browser state. MEM RESET irreversibly removes local browser configuration but does not delete backend SQLite, disk files, or remote game-server data. Export a SYS BACKUP first when recovery may be needed.",
                "assets/guide/13-backup-database.png",
                ["AUTO-BACKUP and 48H browser timer", "SYS BACKUP and RESTORE", "MEM RESET confirmation", "ADV, DB, COPY and LOG"]
            )},
            { id: "troubleshooting", number: "14", title: "SYS-LOG & TROUBLESHOOTING", ...standard(
                "Diagnose client, backend, audio, and history problems without exposing secrets.",
                ["SYS-LOG shows normal and advanced client messages; COPY copies its visible text.", "Health is available at `/api/v1/community/health` on the same STM origin.", "Ctrl+Shift+R reloads local dashboard assets."],
                ["For no sound: clear mute, set volume, click INIT COMM, then TEST; AUDIO LOCKED means a user gesture is still required.", "For missing history: distinguish a new/empty SQLite database from an API or query failure by checking Health, version, and SYS-LOG.", "Connection messages may indicate the STM backend, game query, or WebSocket path; validate them separately. Never paste `.env`, tokens, private addresses, or database contents into diagnostics."],
                "SYS-LOG is primarily current-page state; ADV preference survives reload. Backend Health and database state are independent of the browser log.",
                "CAUTION: Do not use MEM RESET to repair backend history. It cannot restore SQLite data and will remove useful local configuration needed for diagnosis.",
                "assets/guide/14-troubleshooting.png",
                ["SYS-LOG status messages", "COPY and ADV", "Health/version", "Audio and history checklist"]
            )}
        ],
        glossary: [
            ["OPR", "Current operators/players reported for a server."],
            ["AO", "Area of operations; the map reported by the server query."],
            ["LAT", "Latest query latency in milliseconds."],
            ["APRX", "An approximate or alternate calculated time view, not confirmed evidence."],
            ["EXACT TIME UNKNOWN", "A restart occurred inside a known observation window, but no exact timestamp is defensible."],
            ["UNLINKED", "An active player whose callsign is absent from every local squad."],
            ["WATCHDOG", "Per-server restart analysis mode: OFF, AUTO, or ON."],
            ["RESTART CONFIRMED", "A backend restart event accepted from identity and supporting evidence."]
        ]
    });
}());
