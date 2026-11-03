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
