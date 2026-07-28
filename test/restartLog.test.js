const test = require("node:test");
const assert = require("node:assert/strict");
const RestartLog = require("../src/restartLog");

const restartLog = new RestartLog();

function event(restartAt, overrides = {}) {
    return {
        id: 7,
        serverId: "EU1",
        data: {
            classification: "PROCESS_RESTART",
            timeKnown: true,
            restartAt,
            ...overrides
        }
    };
}

test("restart log derives regular and outlier labels without mutating events", () => {
    const source = event("2026-07-28T03:22:05.916Z");
    const prediction = {
        status: "PREDICTED",
        cycleHours: 8,
        confidence: 0.91,
        inliers: [{ restartAt: source.data.restartAt }],
        outliers: []
    };
    const enriched = restartLog.enrich(source, prediction);

    assert.equal(
        enriched.predictionAssessment.classification,
        "REGULAR"
    );
    assert.equal(source.predictionAssessment, undefined);
    assert.equal(enriched.evidenceScore.role, "EXPLANATORY_ONLY");

    prediction.inliers = [];
    prediction.outliers = [{ restartAt: source.data.restartAt }];
    assert.equal(
        restartLog.classify(source, prediction).classification,
        "ADDITIONAL_OUTLIER"
    );
});

test("restart time inside an observation gap remains undetermined", () => {
    const source = event(null, {
        classification:
            "PROCESS_RESTART_IN_OBSERVATION_GAP",
        timeKnown: false,
        observationWindow: {
            start: "2026-07-27T21:49:22.590Z",
            end: "2026-07-28T00:22:04.696Z"
        }
    });
    const assessment = restartLog.classify(source, {
        status: "PREDICTED",
        cycleHours: 8,
        confidence: 1,
        inliers: [],
        outliers: []
    });

    assert.equal(assessment.classification, "UNDETERMINED");
});

test("restart is undetermined while the model is still learning", () => {
    const assessment = restartLog.classify(
        event("2026-07-28T03:22:05.916Z"),
        { status: "LEARNING", confidence: 0.4 }
    );

    assert.equal(assessment.classification, "UNDETERMINED");
    assert.equal(assessment.modelStatus, "LEARNING");
});
