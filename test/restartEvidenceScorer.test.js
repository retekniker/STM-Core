const test = require("node:test");
const assert = require("node:assert/strict");
const RestartEvidenceScorer =
    require("../src/restartEvidenceScorer");

const scorer = new RestartEvidenceScorer();

function rotation() {
    return {
        present: true,
        consecutiveReadings: 2,
        previousSteamId: "OLD",
        currentSteamId: "NEW"
    };
}

test("thresholds are explicit and cover every evidence level", () => {
    assert.deepEqual(
        RestartEvidenceScorer.THRESHOLDS,
        {
            CONFIRMED: 60,
            HIGH: 45,
            PROBABLE: 25,
            SUSPECTED: 10
        }
    );
    assert.equal(scorer.getLevel(60, true), "CONFIRMED");
    assert.equal(scorer.getLevel(59, true), "HIGH");
    assert.equal(scorer.getLevel(45, true), "HIGH");
    assert.equal(scorer.getLevel(25, true), "PROBABLE");
    assert.equal(scorer.getLevel(10, true), "SUSPECTED");
    assert.equal(scorer.getLevel(9, true), "REJECTED");
});

test("stable Steam ID rotation confirms even without roster evidence", () => {
    const result = scorer.score({
        evidence: {
            steamIdRotation: rotation(),
            rosterReset: { present: false, before: 0, after: 0 }
        }
    });

    assert.equal(result.total, 60);
    assert.equal(result.level, "CONFIRMED");
    assert.equal(result.hasPrimaryEvidence, true);
});

test("supporting evidence and prediction cannot confirm without rotation", () => {
    const result = scorer.score({
        evidence: {
            queryInterruption: { present: true, failedQueries: 3 },
            offlineState: { present: true },
            rosterReset: { present: true },
            playerSessionReset: { present: true, players: ["A"] }
        },
        scheduleProximity: { present: true }
    });

    assert.equal(result.total, 45);
    assert.equal(result.level, "HIGH");
    assert.equal(result.hasPrimaryEvidence, false);
});

test("observation gaps and contradictory signals have negative points", () => {
    const result = scorer.score({
        evidence: {
            steamIdRotation: rotation(),
            observationGap: { present: true, durationMs: 600000 },
            playerSessionContinuity: { present: true, players: ["A"] },
            candidateReturnedToOldId: {
                present: true,
                candidateSteamId: "NEW",
                previousSteamId: "OLD"
            }
        }
    });

    assert.equal(result.total, -55);
    assert.equal(result.level, "REJECTED");
    assert.deepEqual(
        result.breakdown.map(item => item.value),
        [60, -15, -20, -80]
    );
    for (const item of result.breakdown) {
        assert.equal(typeof item.name, "string");
        assert.equal(typeof item.value, "number");
        assert.equal(typeof item.justification, "string");
        assert.ok(item.sourceData);
    }
});

test("schedule proximity is only a small supporting point", () => {
    const result = scorer.score({
        scheduleProximity: {
            present: true,
            predictedWindowStart: "2026-07-28T03:10:00.000Z",
            predictedWindowEnd: "2026-07-28T03:30:00.000Z"
        }
    });

    assert.equal(result.total, 5);
    assert.equal(result.level, "REJECTED");
    assert.equal(result.hasPrimaryEvidence, false);
});
