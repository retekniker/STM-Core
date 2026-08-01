(function () {
    "use strict";

    const standard = (purpose, controls, how, persistence, safety, image, callouts, notes = []) => ({
        purpose, controls, how, persistence, safety, image, callouts, notes
    });

    window.STM_GUIDE_CONTENT = Object.freeze({
        version: "0.8.15",
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
                ["Squad selector chooses ALFA–GOLF or FAV.", "SORT cycles ADDED, A-Z, and ONLINE.", "STATS toggles session and accumulated browser history.", "AUTO-FAV adds newly observed unassigned joiners to FAV while enabled.", "EXPORT OPERATORS downloads local operator names with TOTAL and LAST SESSION time.", "ADD inserts the typed callsign; DRAFT UNLINKED scans active unlinked players; PURGE empties only the selected squad."],
                ["A callsign can exist in only one squad. ADD rejects duplicates and full rosters (11 for ALFA–GOLF, 210 for FAV). Remove an entry with its X before assigning it elsewhere.", "Current server session time and persistent local total time are different counters. STATS only changes presentation.", "AUTO-FAV does not retroactively import all currently connected users; DRAFT UNLINKED performs that explicit scan."],
                "Squads, selected squad, sorting, and accumulated statistics use this browser's localStorage. SORT survives reload; STATS and AUTO-FAV reset on reload. None of these values is synchronized by the backend.",
                "CAUTION: PURGE immediately clears the selected local squad without confirmation. It does not kick players, alter server membership, or erase telemetry/database history.",
                "assets/guide/04-squad-tracking.png",
                ["Squad selector and mode controls", "EXPORT OPERATORS", "Linked and unlinked operators", "ADD, DRAFT UNLINKED and PURGE"]
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
                ["OFF disables restart analysis for that server.", "AUTO shows ANALYSIS while STM establishes a safe restart baseline.", "ON performs full restart evaluation and runs the clock from the last exact confirmed restart."],
                ["A state button takes effect on one click. The backend supplies a monitoring-session ID; browser state is restored only while that backend session remains the same.", "On a new backend session, the dashboard reads each server's authoritative confirmed restart history. An exact restart less than eight hours old restores ON and its true lastRestartAt; exactly eight hours or older, missing, future, or invalid evidence starts AUTO / ANALYSIS.", "The persistent backend history wins over stale localStorage. Restarting or reinstalling STM-Core does not create a game-server restart event, and hydration never adds a restart or flag."],
                "Manual OFF/AUTO/ON and the client clock are cached with the current monitorStartedAt identifier. Reloading the same backend session preserves that manual choice. Confirmed restart events and timestamps remain read-only SQLite history during startup hydration.",
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
                ["Choose EU1/EU2/EU3 and 30 MIN through 48 H.", "Toggle Players, Max Slots, and Ping.", "Drag/pan the navigator or handles to change the visible range.", "PREVIOUS RESTART and NEXT RESTART repeatedly step through the stable chronological restart index; LIVE follows newest data and RESET VIEW restores the selected range."],
                ["Players/Max Slots use the left axis and Ping the right axis. Tooltips report timestamps and values.", "Source samples is the fetched set; visible samples is the subset inside the current window.", "EXACT TIME UNKNOWN marks a restart known only to have occurred inside an observation gap. Gaps are intentionally broken rather than connected by a misleading line."],
                "Inspector navigation is temporary UI state. Telemetry and confirmed restart markers come from backend SQLite.",
                "NOTE: PREVIOUS/NEXT are disabled only at the true ends of the selected server's restart index. Unknown-time events use their observation-window boundary for navigation while retaining EXACT TIME UNKNOWN.",
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
                "Compare current slot utilization and total active personnel history across monitored servers.",
                ["EU1/EU2/EU3 rows show current utilization and ONLINE/OFFLINE.", "TOTAL summarizes current players against total available slots.", "30 MIN, 2 H, 6 H, 12 H, 24 H and 48 H select the SQLite history window."],
                ["Top percentages remain current players divided by reported max slots.", "ACTIVE PERSONNEL HISTORY sums the representative integer Players sample from every configured server in each complete time bucket.", "If any server lacks a reliable sample, the line breaks instead of treating missing data as zero. The PLAYERS axis never shows fractional personnel."],
                "Current percentages are live backend state. Chart samples are read from backend SQLite and survive browser closure and STM-Core restart.",
                "NOTE: An offline server may have no meaningful current percentage; read its status before comparing bars.",
                "assets/guide/10-asset-saturation.png",
                ["Per-server utilization", "30 MIN–48 H controls", "ACTIVE PERSONNEL HISTORY", "Integer PLAYERS axis"]
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
                ["Single-click a server clock to toggle elapsed uptime and the APRX restart-time view.", "Double-click the telemetry chart resets its view; v0.8.15 has no active manual time-injection prompt in the server clock handler."],
                ["The header clock shows local wall time. Server clocks derive from backend core uptime/lastRestartAt and update each second.", "The APRX badge identifies the alternate calculated display, not a new confirmed restart. Backend restart evidence mathematically establishes confirmed time; unknown observation gaps remain explicitly approximate."],
                "Clock display mode is in-memory browser state and resets on reload. Confirmed restart time and uptime are backend state.",
                "IMPORTANT: The current v0.8.15 clock code implements only a single-click display toggle; do not treat APRX as persisted evidence.",
                "assets/guide/12-clock-override.png",
                ["Header clock", "Elapsed/countdown display", "Single-click APRX view", "Confirmed restart reference"]
            )},
            { id: "operator-logs", number: "13", title: "OPERATOR EXPORTS & SESSION LOGS", ...standard(
                "Export local operator statistics and work with the current browser-tab diagnostic log.",
                ["EXPORT OPERATORS in SQUAD ROSTER downloads names with TOTAL and LAST SESSION time.", "ADV LOG enables additional browser diagnostics.", "COPY LOG copies the complete in-memory log for this tab.", "SAVE LOG downloads that session log as plain text."],
                ["Operator export reads local browser statistics; it is not the backend SQLite database.", "SYS-LOG keeps up to 20,000 in-memory entries while only a readable subset is visible at once.", "COPY LOG falls back to a temporary local selection when Clipboard API permission is unavailable. SAVE LOG includes a generated timestamp and the current tab's entries."],
                "ADV preference and operator totals use localStorage. The SYS-LOG content resets with the tab. Downloaded TXT files persist where the browser saves them; backend telemetry and restarts remain separate in SQLite.",
                "NOTE: Session-log actions do not back up, restore, reset, or modify backend SQLite.",
                "assets/guide/13-backup-database.png",
                ["EXPORT OPERATORS", "ADV LOG", "COPY LOG", "SAVE LOG and readable DMD rows"]
            )},
            { id: "troubleshooting", number: "14", title: "SYS-LOG & TROUBLESHOOTING", ...standard(
                "Diagnose client, backend, audio, and history problems without exposing secrets.",
                ["SYS-LOG shows categorized current-tab messages; ADV LOG adds browser diagnostics, COPY LOG copies the in-memory session, and SAVE LOG downloads it.", "Health is available at `/api/v1/community/health` on the same STM origin.", "Ctrl+Shift+R reloads local dashboard assets."],
                ["For no sound: clear mute, set volume, click INIT COMM, then TEST; AUDIO LOCKED means a user gesture is still required.", "For missing history: distinguish a new/empty SQLite database from an API or query failure by checking Health, version, and SYS-LOG.", "Connection messages may indicate the STM backend, game query, or WebSocket path; validate them separately. Never paste `.env`, tokens, private addresses, or database contents into diagnostics."],
                "SYS-LOG is primarily current-page state; ADV preference survives reload. Backend Health and database state are independent of the browser log.",
                "IMPORTANT: Session logs are diagnostic browser state, not a backend backup. Never paste secrets, private configuration, or database contents into them.",
                "assets/guide/14-troubleshooting.png",
                ["SYS-LOG categorized messages", "ADV LOG, COPY LOG and SAVE LOG", "Health/version", "Audio and history checklist"]
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
