/* -----------------------------
   BACKGROUND SERVICE WORKER
   Owns the session scan cache
   (chrome.storage.session is only
    available here + popup, not in
    content scripts)
------------------------------ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "CACHE_SCAN") {
        chrome.storage.session.set({ lastScan: msg.payload }, () => {
            sendResponse({ ok: true });
        });
        return true; // keep channel open for async response
    }

    if (msg.action === "GET_SCAN") {
        chrome.storage.session.get("lastScan", (res) => {
            sendResponse({ lastScan: res.lastScan || null });
        });
        return true;
    }
});

/* -----------------------------
   REMEMBER ME — KEEP-ALIVE
   Credentials are never read or
   logged here; only rememberMe.enabled
   and failed/paused are touched.
------------------------------ */

const KEEPALIVE_ALARM = "gs-keepalive";
const COOKIE_LIFETIME_S = 30 * 24 * 60 * 60;

function getRememberMe(cb) {
    chrome.storage.local.get("rememberMe", res => cb(res.rememberMe || null));
}

function ensureKeepAliveAlarm() {
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 20 });
}

chrome.runtime.onInstalled.addListener(ensureKeepAliveAlarm);
chrome.runtime.onStartup.addListener(ensureKeepAliveAlarm);

// Turn a Cardmarket session cookie into a 30-day cookie so the login
// survives a browser restart. Caller has already checked rememberMe.enabled.
// The re-set cookie has an expirationDate, so it is never extended again
// (no onChanged loop).
function extendSessionCookie(cookie) {
    if (!cookie || cookie.expirationDate || cookie.session === false) return;
    const domain = (cookie.domain || "").replace(/^\./, "");
    if (domain !== "cardmarket.com" && domain !== "www.cardmarket.com") return;
    if (cookie.partitionKey) return;

    const details = {
        url: "https://www.cardmarket.com" + (cookie.path || "/"),
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        storeId: cookie.storeId,
        expirationDate: Math.floor(Date.now() / 1000) + COOKIE_LIFETIME_S
    };
    // Host-only cookies must not get a domain, or a second (domain)
    // cookie would be created next to the original.
    if (!cookie.hostOnly) details.domain = cookie.domain;
    chrome.cookies.set(details, () => {
        if (chrome.runtime.lastError) {
            console.warn("Grading Scanner could not extend a session cookie:", chrome.runtime.lastError.message);
        }
    });
}

// Extend session cookies that already exist (e.g. the login made before
// Remember me was switched on).
function sweepSessionCookies() {
    chrome.cookies.getAll({ url: "https://www.cardmarket.com/" }, cookies => {
        if (chrome.runtime.lastError || !cookies) return;
        cookies.filter(c => c.session && !c.partitionKey).forEach(extendSessionCookie);
    });
}

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== KEEPALIVE_ALARM) return;
    getRememberMe(rm => {
        if (!rm || !rm.enabled) return;
        sweepSessionCookies();
        fetch("https://www.cardmarket.com/en/", { credentials: "include" })
            .catch(err => console.warn("Grading Scanner keep-alive request failed:", err && err.message));
    });
});

chrome.cookies.onChanged.addListener(({ removed, cookie }) => {
    if (removed || !cookie || cookie.expirationDate) return;
    getRememberMe(rm => {
        if (rm && rm.enabled) extendSessionCookie(cookie);
    });
});

// Remember me switched on (off -> on, or a new record saved enabled): sweep now.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.rememberMe) return;
    const was = changes.rememberMe.oldValue;
    const now = changes.rememberMe.newValue;
    if (now && now.enabled && !(was && was.enabled)) sweepSessionCookies();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action !== "AUTH_RETRY" || sender.tab) return; // popup only
    getRememberMe(rm => {
        if (!rm) { sendResponse({ ok: false }); return; }
        chrome.storage.local.set({ rememberMe: Object.assign({}, rm, { failed: null, paused: false, pendingAttemptAt: null }) }, () => {
            sendResponse({ ok: true });
        });
    });
    return true;
});
