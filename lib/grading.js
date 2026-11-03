(function (root) {
    const GRADING_PATTERNS = [
        { name: "PSA", pattern: /psa\s*(?:10|[1-9])/i, color: "#d9534f" },
        { name: "CGC", pattern: /cgc\s*(?:10|9\.5|[1-9](?:\.\d)?)/i, color: "#ff6b35" },
        { name: "BGS", pattern: /(?:bgs|beckett)\s*(?:10|9\.5|[1-9](?:\.\d)?)/i, color: "#f7931e" },
        { name: "TAG", pattern: /tag\s*(?:10|[1-9])/i, color: "#4a90e2" },
        { name: "ACE", pattern: /ace\s*(?:10|[1-9])/i, color: "#50c878" },
        { name: "MNT", pattern: /mnt\s*(?:10|[1-9])/i, color: "#9b59b6" },
        { name: "SGC", pattern: /sgc\s*(?:10|[1-9])/i, color: "#e74c3c" }
    ];

    // Words that, when they appear right before a grade match ("not a PSA 10",
    // "far from CGC 9"), mean the seller is denying the grade rather than
    // claiming it — those must not be flagged as graded listings.
    const NEGATION_CUES = /\b(not|no|non|isn'?t|wasn'?t|aren'?t|ain'?t|never|won'?t|wouldn'?t|doesn'?t|didn'?t|far from|nowhere near|hardly|barely)\b/i;

    // Words right after a grade ("PSA 10 chance", "psa 10 potential") mean the
    // seller is speculating about a future grade, not claiming one.
    const POTENTIAL_CUES = /\b(chance|potential|candidate|ready|worthy|possible|quality|material|hope|möglich|potenzial|kandidat)\b/i;

    function isNegatedMatch(text, matchIndex) {
        const windowStart = Math.max(0, matchIndex - 40);
        const before = text.slice(windowStart, matchIndex);
        const boundary = Math.max(
            before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"),
            before.lastIndexOf(","), before.lastIndexOf(";")
        );
        return NEGATION_CUES.test(before.slice(boundary + 1));
    }

    function isPotentialMatch(text, matchEnd) {
        const after = text.slice(matchEnd, matchEnd + 30);
        const boundary = after.search(/[.!?,;]/);
        const clause = boundary === -1 ? after : after.slice(0, boundary);
        const firstWords = clause.trim().split(/\s+/).slice(0, 3).join(" ");
        return POTENTIAL_CUES.test(firstWords);
    }

    function detectGrade(text, allowedGraders = null) {
        for (const g of GRADING_PATTERNS) {
            if (allowedGraders && !allowedGraders.includes(g.name)) continue;
            const re = new RegExp(g.pattern.source, g.pattern.flags.replace("g", "") + "g");
            for (const match of text.matchAll(re)) {
                if (isNegatedMatch(text, match.index)) continue;
                if (isPotentialMatch(text, match.index + match[0].length)) continue;
                const grade = match[0].match(/\d+(?:\.\d)?/)[0];
                return { grader: g.name, grade, gradeText: g.name + " " + grade, color: g.color };
            }
        }
        return null;
    }

    const api = { GRADING_PATTERNS, detectGrade, isNegatedMatch, isPotentialMatch };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
