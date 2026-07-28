class RestartLog {

    classify(event, prediction) {
        const data = event?.data || {};
        const restartAt = data.restartAt;

        if (
            data.classification ===
                "PROCESS_RESTART_IN_OBSERVATION_GAP" ||
            data.timeKnown === false ||
            !restartAt ||
            prediction?.status !== "PREDICTED"
        ) {
            return {
                classification: "UNDETERMINED",
                modelStatus:
                    prediction?.status ||
                    "INSUFFICIENT_DATA",
                cycleHours:
                    prediction?.cycleHours ?? null,
                confidence:
                    prediction?.confidence ?? 0
            };
        }

        const timestamp = Date.parse(restartAt);
        const matches = samples =>
            Array.isArray(samples) &&
            samples.some(sample =>
                Date.parse(sample.restartAt) === timestamp
            );

        let classification = "UNDETERMINED";

        if (Number.isFinite(timestamp)) {
            if (matches(prediction.inliers)) {
                classification = "REGULAR";
            } else if (matches(prediction.outliers)) {
                classification = "ADDITIONAL_OUTLIER";
            }
        }

        return {
            classification,
            modelStatus: prediction.status,
            cycleHours: prediction.cycleHours ?? null,
            confidence: prediction.confidence ?? 0
        };
    }

    enrich(event, prediction) {
        return {
            ...event,
            predictionAssessment:
                this.classify(event, prediction)
        };
    }
}

module.exports = RestartLog;
