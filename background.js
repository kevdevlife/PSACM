/* -----------------------------
   BACKGROUND SERVICE WORKER
   Owns the session scan cache
   (chrome.storage.session is only
    available here + popup, not in
    content scripts)
------------------------------ */

importScripts("lib/cookie-record.js");

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

// Cookies we extended are recorded (no values) under this key so they can
// be turned back into session cookies when Remember me goes off.
const EXTENDED_KEY = "gsExtendedCookies";

// Extending and reverting both read-modify-write EXTENDED_KEY; one queue
// keeps them from interleaving.
let cookieQueue = Promise.resolve();
function enqueueCookieWork(fn) {
    cookieQueue = cookieQueue.then(fn).catch(err =>
        console.warn("Grading Scanner cookie update failed:", err && err.message));
    return cookieQueue;
}

async function readExtended() {
    const res = await chrome.storage.local.get(EXTENDED_KEY);
    return Array.isArray(res[EXTENDED_KEY]) ? res[EXTENDED_KEY] : [];
}

// Turn a Cardmarket session cookie into a 30-day cookie so the login
// survives a browser restart. Re-checks rememberMe.enabled inside the queue.
// The re-set cookie has an expirationDate, so it is never extended again
// (no onChanged loop).
function extendSessionCookie(cookie) {
    if (!cookie || cookie.expirationDate || cookie.session === false) return;
    const domain = (cookie.domain || "").replace(/^\./, "");
    if (domain !== "cardmarket.com" && domain !== "www.cardmarket.com") return;
    if (cookie.partitionKey) return;

    enqueueCookieWork(async () => {
        const res = await chrome.storage.local.get("rememberMe");
        if (!res.rememberMe || !res.rememberMe.enabled) return;
        await chrome.cookies.set(cookieSetDetails(cookie, cookie.value,
            Math.floor(Date.now() / 1000) + COOKIE_LIFETIME_S));
        const list = addCookieRecord(await readExtended(), cookieRecord(cookie));
        await chrome.storage.local.set({ [EXTENDED_KEY]: list });
    });
}

// Remember me off or forgotten: every recorded cookie that still exists
// becomes a session cookie again (same value, no expirationDate).
function revertExtendedCookies() {
    enqueueCookieWork(async () => {
        const records = await readExtended();
        for (const rec of records) {
            try {
                const found = await chrome.cookies.getAll({ name: rec.name, storeId: rec.storeId });
                const live = (found || []).find(c => !c.partitionKey && sameCookie(c, rec));
                if (!live || !live.expirationDate) continue;
                await chrome.cookies.set(cookieSetDetails(live, live.value));
            } catch (err) {
                console.warn("Grading Scanner could not restore a session cookie:", err && err.message);
            }
        }
        await chrome.storage.local.remove(EXTENDED_KEY);
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
    // extendSessionCookie checks rememberMe.enabled itself
    extendSessionCookie(cookie);
});

// Remember me switched on (off -> on, or a new record saved enabled): sweep now.
// Switched off (on -> off) or forgotten (record removed): undo the extension.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.rememberMe) return;
    const was = changes.rememberMe.oldValue;
    const now = changes.rememberMe.newValue;
    if (now && now.enabled && !(was && was.enabled)) sweepSessionCookies();
    if (!now || (was && was.enabled && !now.enabled)) revertExtendedCookies();
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
