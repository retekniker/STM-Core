# Changelog

## 0.8.19

### Added

- Adds readable TXT exports for the current Activity Feed, the complete Restart Log and individual restart records with all recorded evidence.
- Adds persistent per-entry removal in Restart Log without deleting authoritative restart or telemetry history.
- Adds Ctrl/Cmd multi-selection in the live roster so one Add action can assign several players to the selected squad.
- Adds EU1, EU2, EU3 and Total selectors for Asset Saturation history, with Total selected by default.

### Changed

- Shows only the predicted restart time in the third EU server-clock state; cycle and confidence details move to the top DMD.
- Keeps compact Activity Feed controls to Export, Zoom and Restart Log, while the enlarged view exposes Clear All, Export and Close without Zoom.
- Shows player count to the left of saturation percentage and defaults fresh roster sorting to Online while preserving later choices.
- Makes Telemetry LIVE active only at the live edge and makes restart navigation inert at either end of the list.
- Removes Draft Unlinked.

### Compatibility and verification

- Preserves JSOC pulsing, first-run INIT COMM attention, runtime DMD versioning, roster join/leave DMD messages, admin alerts and framing, and weekly history ranges.
- Retains authoritative SQLite telemetry and restart records when visible log entries are cleared or removed.

## 0.8.17

### Added

- Adds a third EU1/EU2/EU3 clock state that shows the current time before scrolling the backend Restart Prediction details in a DMD-style presentation.
- Adds a subtle white-red frame pulse on the player list of a server containing an explicitly verified administrator.
- Adds a JSOC join welcome in the top DMD with the player's displayed name.
- Adds a seven-day range to the enlarged Telemetry Inspector.

### Changed

- Expands Activity Feed Zoom to approximately 90% of the viewport while preserving the compact panel and the established clear-action semantics.
- Restores the JSOC player-name pulse and keeps reduced-motion preferences respected.
- Optimizes seven-day telemetry reads with server-filtered SQLite buckets that preserve first/last samples, extrema and status transitions before final response bounding.
- Refreshes the public README for current Windows, Linux, app-mode/tray and mobile PWA usage.

### Fixed

- Restores the visible `INIT.COM` blink whenever the first-start voice-communications standby message is armed, until the operator activates it.
- Stops rank prefixes from being treated as proof of administrator identity. `Seawall` and any other unverified ranked player no longer trigger administrator alerts, while explicitly verified callsigns retain their alerts.

### Compatibility and safety

- Preserves the v0.8.16 Windows per-user installer, local backend, tray, autostart, shortcuts, app-mode browser fallback and persistent data directories.
- Preserves existing chart ranges, responsive desktop/tablet/phone layouts, Activity Feed and Restart Log clearing behavior, SQLite history and server configuration.
- Adds no new credential storage and makes no changes to private proxy or authentication deployments.

### Verification

- Adds regression coverage for ranked non-admin and verified-admin classification, JSOC presentation, `INIT.COM`, Activity Feed Zoom, the three-state clock and the bounded seven-day telemetry path.
- Verifies the complete Node.js test suite and the Linux and Windows release builds from the tagged release commit.

## 0.8.16

### Added

- Adds a seven-day Active Personnel History range with bounded 30-minute buckets and an efficient read-only SQLite query.
- Adds a per-user Windows app-mode launcher that prefers Chrome or Edge, opens maximized, and falls back to the default browser.
- Adds STM Core icons for the installer, tray and optional shortcuts, plus the ReTek/Rytek logo inside the installer wizard.

### Changed

- Defaults fresh chart-range preferences to 12 hours and restores each later manual choice from local browser storage.
- Separates Activity Feed-only, Restart Log-only and combined clearing with explicit confirmations.
- Improves responsive sizing for charts, range controls, phones, tablets and desktop app windows.
- Makes the installer display the STM Core version directly from package metadata.

### Removed

- Removes the in-app Guide, its navigation, scripts, styles and screenshots.
- Removes the redundant Restore action from the enlarged Activity Feed; Close retains the same return behavior.

### Safety

- Keeps telemetry and authoritative restart history intact when clearing visible logs.
- Keeps the Windows backend, data directory, tray lifetime and autostart behavior unchanged.

## 0.8.15

### Added

- Adds SQLite-backed Active Personnel History ranges from 30 minutes through 48 hours.
- Adds stable bidirectional navigation across the authoritative restart index.
- Adds read-only Watchdog startup hydration from confirmed SQLite restart history.

### Changed

- Simplifies the header and expands the DMD by removing obsolete radar and manual sync controls.
- Replaces misleading browser backup controls with honest session-log and operator-export actions.
- Refreshes the 14-chapter offline STM Field Manual for the v0.8.15 interface.

### Fixed

- Allows repeated PREVIOUS RESTART navigation and arbitrary direction changes.
- Prevents fractional player labels and incomplete cross-server totals in Asset Saturation history.
- Preserves same-session manual Watchdog choices while safely restoring fresh restart clocks after an STM-Core process restart.

## 0.8.14

### Added

- Rebuilt STM Field Manual with 14 functional chapters.
- Offline screenshots with numbered callouts and lightbox inspection.
- Responsive table of contents and chapter navigation.

### Changed

- Removed the legacy Guide text.
- Documentation now reflects verified runtime behavior.

## 0.8.13

### Added

- Adds a responsive Activity Feed Inspector with live updates, Restart Log mode, per-entry dismissal and keyboard or button closing.
- Adds persistent, synchronized Activity Feed and feed-facing Restart Log clearing with an explicit STM-styled confirmation.

### Changed

- Improves blinking ONLINE and other Asset Saturation status readability with a bounded responsive font size and stronger glow.

### Safety

- Clearing Activity Feed stores only a durable cutoff and does not delete telemetry, authoritative restart records, restart markers, uptime or chart history.
- Renders external Activity Feed text through DOM text nodes in both compact and enlarged views.

## 0.8.12

### Added

- Recognizes 77th JSOC members from explicit clan identifiers and controlled official rank prefixes while preserving squad styling.
- Highlights locally classified Ambassadors, Command and High Command personnel with a red-white name animation.
- Adds an `ADMIN ON SERVER` panel listing every priority person by server in stable order.
- Adds readable restart flags and enlarged deterministic hover targets to mini oscilloscopes and the Telemetry Inspector.

### Fixed

- Restores normal JSOC name pulsing for ranked names that do not contain `77th` or `JSOC` and for members assigned to the currently selected squad.
- Keeps restart flags inside chart bounds, recalculates their hitboxes after resize and avoids deterministic collisions without changing chart scales.
- Preserves existing restart details, `EXACT TIME UNKNOWN` gaps, navigator behavior and stable Ping ranges while interacting with restart flags.
- Adds regression coverage for member and priority classification, safe administrator-alert rendering, restart-flag geometry and hover behavior.

## 0.8.11

### Telemetry charts

- Keeps all three mini oscilloscopes stable and visible across intermediate container widths, display resolutions and browser zoom levels.
- Uses a one CSS pixel Ping line without visible points and applies consistent per-server Ping colors in the Telemetry Inspector legend and axis.
- Preserves deterministic Ping axis ranges during canvas resize and browser zoom changes.
- Breaks Ping and Players datasets, including the navigator, across `EXACT TIME UNKNOWN` observation gaps instead of interpolating nonexistent telemetry.

### Restart clock

- Distinguishes browser reloads from backend monitoring-process sessions and prevents stale manual ON state from restoring false uptime after STM Core restarts.
- Re-arms a new monitoring session in AUTO and makes its first confirmed restart the authoritative clock base while preserving manual OFF and ON within the same session.

### Tests

- Extended dashboard and API regression coverage for responsive chart geometry, stable Ping ranges, unknown-time gaps and backend-session-aware uptime restoration.

## 0.8.10

### Restart clock

- Fixed automatic clock transition from AUTO to ON after a confirmed restart.
- Preserves OFF and ON modes, updates the clock base for consecutive restarts and leaves a historical session baseline unchanged.
- Persists the automatic ON transition in browser localStorage.

### Telemetry Inspector

- Added fullscreen Telemetry Inspector opened from each server oscilloscope.
- Added 24-hour and 48-hour telemetry views.
- Added horizontal pan, cursor-centered zoom and a timeline navigator with adjustable handles.
- Added LIVE, RESET VIEW, previous/next restart navigation and a focused -15/+30 minute restart view.
- Added automatic raw-detail loading for short time windows.
- Added synchronized player, ping and query/status telemetry with bucket extrema and sample metadata.
- Added detailed restart, observation-gap and prediction markers.

### API and offline dashboard

- Extended telemetry API with custom time windows, per-server queries, bounded point counts and selectable auto, overview or raw resolution.
- Added request validation and response metadata describing source snapshots, returned points and bucket resolution.
- Bundled Chart.js 4.5.1 locally for offline dashboard operation.

## 0.8.9 - Release candidate

### Restart detection

- Made the backend tracker the sole authority for process-restart confirmation.
- Added two-reading verification of Steam ID rotation with a visible `VERIFYING` candidate state.
- Rejects transient Steam IDs and candidates that return to the previously stable ID without resetting the restart clock.
- Distinguishes exact `PROCESS_RESTART` events from `PROCESS_RESTART_IN_OBSERVATION_GAP`, where the exact restart time remains unknown.
- Records query interruption, offline state, roster reset, A2S player-session reset, observation gap and rejected transitional IDs as structured evidence.
- Added explainable evidence scoring with named positive and contradictory signals, explicit thresholds and a full point breakdown. Scoring describes evidence only and cannot confirm or reject a restart independently of the tracker state machine.

### Restart prediction

- Added independent per-server learning for standard 6-hour and 8-hour cycles and custom cycles.
- Supports missed-cycle multiples and separates additional/manual restarts as outliers.
- Ignores observation-gap restarts as exact timing samples.
- Prevents multiple nearby restarts from occupying the same predicted cycle slot.
- Predictions are warnings only and never create restart events or reset restart clocks.

### History and dashboard

- Added SQLite-backed telemetry ranges for 30 minutes, 2 hours, 6 hours and 12 hours with bounded downsampling.
- Added confirmed-restart markers, observation-gap intervals and predicted-restart markers to telemetry charts.
- Expanded Restart Log with classification, confidence, restart and detection times, Steam ID rotation, query failures, roster/session evidence, rejected IDs, observation gaps, predictor assessment and evidence-score breakdown.
- Displays real A2S_PLAYER connection time next to each player.
- Removed the browser-local restart detector, local restart clock resets and the fixed 8-hour dashboard prediction.
