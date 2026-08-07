(function () {
    "use strict";
    window.STM_GUIDE_CONTENT = Object.freeze({
        title: "STM-CORE GUIDE",
        sections: [
            { id: "overview", title: "Overview", paragraphs: [
                "STM-Core shows the current state of the configured game servers. Each server panel reports whether the server is online, its player count (OPR), map (AO), query latency (LAT), and the players returned by the latest query.",
                "Use GUIDE [?] to reopen this guide. The application version is shown in the dashboard header."
            ]},
            { id: "servers", title: "Servers and players", paragraphs: [
                "Server panels update from the STM-Core backend. Select a server's OFF, AUTO, or ON control to change its restart-watchdog mode.",
                "Double-click a player in a server list to add that callsign to the selected squad. A callsign can belong to only one squad at a time."
            ]},
            { id: "squads", title: "Squads", paragraphs: [
                "Choose a squad, type a callsign, and select ADD. Use the X beside a callsign to remove it. DRAFT UNLINKED adds currently visible players who are not already in a squad, while PURGE clears the selected squad.",
                "SORT changes the squad order, STATS changes the displayed session statistics, AUTO-FAV assigns newly observed unlinked players to FAV, and EXPORT OPERATORS downloads the operator list. Squad data is stored in this browser."
            ]},
            { id: "activity", title: "Activity and restarts", paragraphs: [
                "The Activity Feed shows current join, leave, and system entries. Select ZOOM to open the larger feed and Restart Log view.",
                "CLEAR ALL asks for confirmation before clearing the visible activity history. Restart records and telemetry are shown separately and are not cleared by that control."
            ]},
            { id: "telemetry", title: "Telemetry", paragraphs: [
                "Telemetry charts show player count and latency over the selected time range. Select a server chart to open Telemetry Inspector, where you can change the server and range, pan or zoom the visible window, and move between recorded restart markers.",
                "Asset Saturation compares current player use across the configured servers and shows active personnel history for the selected range."
            ]},
            { id: "audio-logs", title: "Audio and logs", paragraphs: [
                "Select INIT COMM to enable voice alerts, then use TEST to check audio. The mute and volume controls affect dashboard audio in this browser.",
                "SYS-LOG shows dashboard messages. ADV LOG enables additional diagnostic entries, COPY LOG copies the current log, and SAVE LOG downloads it as a text file. Review logs before sharing them and remove any private information."
            ]}
        ]
    });
}());
