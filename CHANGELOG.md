# Changelog

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
