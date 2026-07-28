class RestartEvidenceScorer {

    static WEIGHTS = Object.freeze({
        STABLE_STEAM_ID_ROTATION: 60,
        QUERY_INTERRUPTION: 10,
        OFFLINE_STATE: 5,
        ROSTER_RESET: 10,
        PLAYER_SESSION_RESET: 15,
        SCHEDULE_PROXIMITY: 5,
        OBSERVATION_GAP: -15,
        PLAYER_SESSION_CONTINUITY: -20,
        CANDIDATE_RETURNED_TO_OLD_ID: -80
    });

    static THRESHOLDS = Object.freeze({
        CONFIRMED: 60,
        HIGH: 45,
        PROBABLE: 25,
        SUSPECTED: 10
    });

    point(name, value, justification, sourceData) {
        return {
            name,
            value,
            justification,
            sourceData
        };
    }

    getLevel(total, hasPrimaryEvidence) {
        const thresholds = RestartEvidenceScorer.THRESHOLDS;

        if (total >= thresholds.CONFIRMED) {
            return hasPrimaryEvidence
                ? "CONFIRMED"
                : "HIGH";
        }
        if (total >= thresholds.HIGH) return "HIGH";
        if (total >= thresholds.PROBABLE) return "PROBABLE";
        if (total >= thresholds.SUSPECTED) return "SUSPECTED";
        return "REJECTED";
    }

    score(input = {}) {
        const evidence = input.evidence || {};
        const weights = RestartEvidenceScorer.WEIGHTS;
        const breakdown = [];
        const rotation = evidence.steamIdRotation || {};
        const hasPrimaryEvidence =
            rotation.present === true &&
            Number(rotation.consecutiveReadings) >= 2 &&
            rotation.previousSteamId !== null &&
            rotation.previousSteamId !== undefined &&
            rotation.currentSteamId !== null &&
            rotation.currentSteamId !== undefined &&
            String(rotation.previousSteamId) !==
                String(rotation.currentSteamId);

        if (hasPrimaryEvidence) {
            breakdown.push(this.point(
                "STABLE_STEAM_ID_ROTATION",
                weights.STABLE_STEAM_ID_ROTATION,
                "A changed Steam ID was repeated in consecutive successful queries",
                rotation
            ));
        }

        const query = evidence.queryInterruption || {};
        if (query.present) {
            breakdown.push(this.point(
                "QUERY_INTERRUPTION",
                weights.QUERY_INTERRUPTION,
                "One or more A2S queries failed before recovery",
                query
            ));
        }

        const offline = evidence.offlineState || {};
        if (offline.present) {
            breakdown.push(this.point(
                "OFFLINE_STATE",
                weights.OFFLINE_STATE,
                "The reliability state reached offline during the transition",
                offline
            ));
        }

        const roster = evidence.rosterReset || {};
        if (roster.present) {
            breakdown.push(this.point(
                "ROSTER_RESET",
                weights.ROSTER_RESET,
                "The observed roster fell to zero or a small fraction of its previous size",
                roster
            ));
        }

        const sessionReset =
            evidence.playerSessionReset || {};
        if (sessionReset.present) {
            breakdown.push(this.point(
                "PLAYER_SESSION_RESET",
                weights.PLAYER_SESSION_RESET,
                "A2S_PLAYER connection times reset for players seen on both sides of the transition",
                sessionReset
            ));
        }

        const schedule = input.scheduleProximity || {};
        if (schedule.present) {
            breakdown.push(this.point(
                "SCHEDULE_PROXIMITY",
                weights.SCHEDULE_PROXIMITY,
                "The transition occurred inside the current predicted restart window",
                schedule
            ));
        }

        const gap = evidence.observationGap || {};
        if (gap.present) {
            breakdown.push(this.point(
                "OBSERVATION_GAP",
                weights.OBSERVATION_GAP,
                "The process changed between observations, so its exact restart time is unknown",
                gap
            ));
        }

        const continuity =
            evidence.playerSessionContinuity || {};
        if (continuity.present) {
            breakdown.push(this.point(
                "PLAYER_SESSION_CONTINUITY",
                weights.PLAYER_SESSION_CONTINUITY,
                "A2S_PLAYER connection times continued to increase across the candidate transition",
                continuity
            ));
        }

        const returned =
            evidence.candidateReturnedToOldId || {};
        if (returned.present) {
            breakdown.push(this.point(
                "CANDIDATE_RETURNED_TO_OLD_ID",
                weights.CANDIDATE_RETURNED_TO_OLD_ID,
                "The Steam ID returned to the previously stable value before confirmation",
                returned
            ));
        }

        const total = breakdown.reduce(
            (sum, item) => sum + item.value,
            0
        );

        return {
            version: 1,
            role: "EXPLANATORY_ONLY",
            total,
            level: this.getLevel(
                total,
                hasPrimaryEvidence
            ),
            hasPrimaryEvidence,
            thresholds: {
                ...RestartEvidenceScorer.THRESHOLDS,
                REJECTED: "BELOW_SUSPECTED"
            },
            breakdown
        };
    }
}

module.exports = RestartEvidenceScorer;
