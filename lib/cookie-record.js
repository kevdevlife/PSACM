(function (root) {
    // Bookkeeping for the session cookies Remember me turns into 30-day
    // cookies, so they can be made session cookies again when Remember me is
    // switched off or forgotten. Records never contain cookie values.

    function cookieRecord(cookie) {
        return {
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path || "/",
            storeId: cookie.storeId,
            hostOnly: !!cookie.hostOnly,
            secure: !!cookie.secure,
            httpOnly: !!cookie.httpOnly,
            sameSite: cookie.sameSite
        };
    }

    function sameCookie(a, b) {
        return a.name === b.name && a.domain === b.domain &&
            (a.path || "/") === (b.path || "/") && a.storeId === b.storeId;
    }

    function addCookieRecord(records, record) {
        const list = Array.isArray(records) ? records.filter(r => !sameCookie(r, record)) : [];
        list.push(record);
        return list;
    }

    // chrome.cookies.set details that re-create `cookie` with the given
    // expirationDate, or as a session cookie when expirationDate is omitted.
    function cookieSetDetails(cookie, value, expirationDate) {
        const path = cookie.path || "/";
        const details = {
            url: "https://www.cardmarket.com" + path,
            name: cookie.name,
            value,
            path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            storeId: cookie.storeId
        };
        if (expirationDate !== undefined) details.expirationDate = expirationDate;
        // Host-only cookies must not get a domain, or a second (domain)
        // cookie would be created next to the original.
        if (!cookie.hostOnly) details.domain = cookie.domain;
        return details;
    }

    const api = { cookieRecord, sameCookie, addCookieRecord, cookieSetDetails };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
