(function (root) {
    const CONDITION_COLORS = {
        MT: { bg: "rgb(23, 162, 184)", fg: "#fff" },
        NM: { bg: "rgba(40, 167, 69, 0.9)", fg: "#fff" },
        EX: { bg: "rgb(130, 137, 30)", fg: "#fff" },
        GD: { bg: "rgb(255, 193, 7)", fg: "rgb(33, 37, 41)" },
        LP: { bg: "rgba(253, 126, 20, 0.9)", fg: "#fff" },
        PL: { bg: "rgba(220, 53, 69, 0.75)", fg: "#fff" },
        PO: { bg: "rgb(220, 53, 69)", fg: "#fff" }
    };

    function conditionOf(listing) {
        const g = listing.grade;
        if (g) {
            return { type: "graded", grader: g.grader, grade: g.grade, gradeText: g.gradeText, color: g.color };
        }
        return { type: "raw", code: listing.conditionCode };
    }

    function makeFavorite(listing) {
        return {
            id: listing.id,
            url: listing.url,
            cardName: listing.cardName,
            seller: listing.seller,
            priceText: listing.priceText,
            language: listing.language,
            condition: conditionOf(listing),
            savedAt: Date.now()
        };
    }

    function isValidFavorite(f) {
        return !!f && !!f.id && !!f.url && !!f.condition && !!f.condition.type;
    }

    function escapeHtml(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    const api = { CONDITION_COLORS, conditionOf, makeFavorite, isValidFavorite, escapeHtml };

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const store = chrome.storage.local;

        api.getFavorites = () => new Promise(resolve => {
            store.get({ favorites: [] }, res => {
                const all = Array.isArray(res.favorites) ? res.favorites : [];
                const valid = all.filter(isValidFavorite);
                if (valid.length !== all.length) store.set({ favorites: valid });
                resolve(valid);
            });
        });

        api.setFavorite = async (fav) => {
            const favs = (await api.getFavorites()).filter(f => f.id !== fav.id);
            favs.push({ ...fav, savedAt: Date.now() });
            await new Promise(resolve => store.set({ favorites: favs }, resolve));
        };

        api.removeFavorite = async (id) => {
            const favs = (await api.getFavorites()).filter(f => f.id !== id);
            await new Promise(resolve => store.set({ favorites: favs }, resolve));
        };
    }

    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
