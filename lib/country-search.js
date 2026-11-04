// Search/rank helper for the searchable Seller Location select.
// Shared between the content script (browser global) and node tests.
(function (root) {
    function foldChar(ch) {
        return ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }

    function normalize(str) {
        return String(str).trim().split("").map(foldChar).join("");
    }

    // Folded string plus, per folded char, the index of its source char,
    // so a match can be highlighted in the original (accented) name.
    function fold(str) {
        let text = "";
        const map = [];
        Array.from(str).reduce((pos, ch) => {
            const f = foldChar(ch);
            for (let i = 0; i < f.length; i++) map.push(pos);
            text += f;
            return pos + ch.length;
        }, 0);
        return { text, map };
    }

    // Returns [{ name, index, start, end }] ranked: name prefix, then word
    // prefix, then any substring; ties keep the original order.
    function searchCountries(names, query) {
        const q = normalize(query || "");
        const out = [];
        names.forEach((name, index) => {
            if (!q) {
                out.push({ name, index, start: 0, end: 0, rank: 0 });
                return;
            }
            const { text, map } = fold(name);
            const at = text.indexOf(q);
            if (at < 0) return;
            let rank = 2;
            let hit = at;
            if (at === 0) rank = 0;
            else {
                // at > 0 here, so a hit is always "separator + query"
                const word = text.search(new RegExp("[\\s\\-']" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
                if (word >= 0) {
                    rank = 1;
                    hit = word + 1;
                }
            }
            const lastSrc = map[hit + q.length - 1];
            const end = lastSrc + Array.from(name.slice(lastSrc))[0].length;
            out.push({ name, index, start: map[hit], end, rank });
        });
        out.sort((a, b) => a.rank - b.rank || a.index - b.index);
        return out.map(({ rank, ...m }) => m);
    }

    const api = { normalize, searchCountries };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
