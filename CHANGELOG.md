# Changelog

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
