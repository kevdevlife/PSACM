const test = require("node:test");
const assert = require("node:assert/strict");
const { detectGrade } = require("../lib/grading.js");

test("flags plain graded listing", () => {
    assert.deepEqual(detectGrade("psa 10 gem mint slab").gradeText, "PSA 10");
});
test("normalises missing space and beckett", () => {
    assert.equal(detectGrade("PSA10").gradeText, "PSA 10");
    assert.equal(detectGrade("beckett 9.5 black label").gradeText, "BGS 9.5");
});
test("Doktor535 false positive is not graded", () => {
    assert.equal(detectGrade("boosterfrisch->Sleeve->Magnetcase->PSA10 Chance"), null);
});
test("potential wording after grade is not graded", () => {
    for (const t of ["psa 10 potential", "PSA 10 candidate!", "psa10 ready", "psa 10 worthy",
                     "possible: psa 10 quality", "cgc 10 material", "psa 10 hope",
                     "PSA 10 möglich", "psa 10 potenzial", "psa 10 kandidat"]) {
        assert.equal(detectGrade(t), null, t);
    }
});
test("negation before grade is not graded", () => {
    assert.equal(detectGrade("not a psa 10"), null);
});
test("words after a sentence boundary don't count as potential", () => {
    assert.equal(detectGrade("PSA 10. Chance to grab a deal").gradeText, "PSA 10");
});
test("first valid grader wins over a potential one", () => {
    assert.equal(detectGrade("CGC 9.5 slab, psa 10 chance").gradeText, "CGC 9.5");
});
test("allowedGraders restricts which graders are considered", () => {
    assert.equal(detectGrade("psa 10 and cgc 9", ["CGC"]).gradeText, "CGC 9");
    assert.equal(detectGrade("psa 10 and cgc 9").gradeText, "PSA 10");
});
test("grader names inside other words are not graded", () => {
    assert.equal(detectGrade("stage 1"), null);
    assert.equal(detectGrade("space 9"), null);
    assert.equal(detectGrade("replace 10"), null);
});
test("PSA half grades are detected", () => {
    assert.equal(detectGrade("psa 8.5").gradeText, "PSA 8.5");
});
test("a decimal point is not a sentence boundary for potential wording", () => {
    assert.equal(detectGrade("psa 9.5 chance"), null);
});
test("potential wording right before the grade is not graded", () => {
    for (const t of ["potential PSA 10", "possible psa 10", "candidate psa 10",
                     "Potential: PSA 10", "psa10 possible"]) {
        assert.equal(detectGrade(t), null, t);
    }
});
test("potential wording with a connector before the grade is not graded", () => {
    for (const t of ["POTENTIAL FOR PSA10", "potential for a psa 10", "chance at psa 10",
                     "good chance of a PSA 10", "candidate for CGC 10", "hoping for psa 10",
                     "ready for psa 10", "Potenzial für PSA 10", "Chance auf PSA 10"]) {
        assert.equal(detectGrade(t), null, t);
    }
});
test("potential wording earlier in the text does not block a later grade", () => {
    assert.equal(detectGrade("potential buyers welcome, psa 10 slab").gradeText, "PSA 10");
});
