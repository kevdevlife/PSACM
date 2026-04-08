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