/* -----------------------------
   REMEMBER ME — AUTO SIGN-IN
   Runs on every Cardmarket page (document_idle), after lib/auth-state.js.

   Site assumptions — NOT verified on the live site (no inspection was
   possible while implementing); NEEDS A LIVE CHECK:
   - Logged in  = an `a[href*="User_Logout"]` link exists (this one IS verified).
   - Logged out = page loaded and no such link.
   - Login form = the <form> that contains an input[type=password]. Expected:
     fields `username` and `userPassword`, action containing `User_Login`,
     hidden `__cmtkn` token (left untouched, the site fills it).
     Username is filled via input[name=username], falling back to the form's
     first text/email input; password via the form's password input.
   - The form is only submitted if its resolved action URL is
     https://www.cardmarket.com/...; anything else -> failed "unknown".
   - Failure classification after an attempt (still logged out):
     captcha (recaptcha|hcaptcha|turnstile|captcha element), verification
     (a visible input whose name/id matches code|otp|2fa|token, not __cmtkn),
     wrong-credentials (a visible .alert-danger), otherwise unknown.
   - Session cookie name/expiry: unknown (it is HttpOnly); background.js
     extends any cardmarket.com session cookie instead.

   Safety: credentials are read from chrome.storage.local and written only
   into Cardmarket's own login form. They are never logged or sent anywhere
   else. At most one automatic attempt per failure state: once an attempt
   fails, `failed` is set and nothing is tried again until the user re-saves
   details or clicks Retry in the popup.
------------------------------ */

(function () {
    if (document.contentType && document.contentType !== "text/html") return;

    const LOGOUT_SELECTOR = 'a[href*="User_Logout"]';
    const LOGOUT_FORM_SELECTOR = 'form[action*="User_Logout"]';
    const ATTEMPTED_KEY = "gsAttempted";
    const RETURN_KEY = "gsReturnTo";
    // Cross-tab guard: sessionStorage is per tab, so several tabs loading at
    // once could each try. A short-lived origin-wide timestamp (no
    // credentials) stops parallel attempts.
    const ATTEMPT_AT_KEY = "gsAuthAttemptAt";
    const ATTEMPT_COOLDOWN_MS = 2 * 60 * 1000;

    let current = null; // latest rememberMe record (kept in sync)

    function ss(op, key, value) {
        try {
            if (op === "get") return sessionStorage.getItem(key);
            if (op === "set") sessionStorage.setItem(key, value);
            if (op === "del") sessionStorage.removeItem(key);
        } catch (e) { /* storage blocked */ }
        return null;
    }

    function updateRecord(patch) {
        if (!current) return;
        current = Object.assign({}, current, patch);
        chrome.storage.local.set({ rememberMe: current });
    }

    function isLoggedIn() {
        return !!document.querySelector(LOGOUT_SELECTOR);
    }

    function isVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    /* ---------- notices ---------- */

    function showNotice(text, kind) {
        const old = document.getElementById("gs-auth-notice");
        if (old) old.remove();

        const alert = document.createElement("div");
        alert.id = "gs-auth-notice";
        alert.className = "alert alert-" + kind + " alert-dismissible fade show my-2";
        alert.setAttribute("role", "alert");

        const msg = document.createElement("span");
        msg.textContent = text;
        alert.appendChild(msg);

        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn-close";
        close.setAttribute("aria-label", "Close");
        close.addEventListener("click", () => alert.remove());
        alert.appendChild(close);

        const main = document.querySelector("main");
        const header = document.querySelector("header");
        if (main) main.prepend(alert);
        else if (header) header.after(alert);
        else document.body.prepend(alert);
    }

    const REASON_TEXT = {
        "wrong-credentials": "the username or password was not accepted",
        "captcha": "Cardmarket asked for a captcha",
        "verification": "Cardmarket asked for extra verification",
        "unknown": "the login could not be completed"
    };

    function showFailure(reason) {
        showNotice("Grading Scanner: automatic sign-in stopped (" +
            (REASON_TEXT[reason] || REASON_TEXT.unknown) +
            "). Re-save your details or click Retry in the extension popup.", "warning");
    }

    function fail(reason) {
        ss("del", ATTEMPTED_KEY);
        ss("del", RETURN_KEY);
        updateRecord({ failed: reason });
        showFailure(reason);
    }

    /* ---------- failure classification ---------- */

    function classifyFailure() {
        const captchaRe = /recaptcha|hcaptcha|turnstile|captcha/i;
        const captchaEl = Array.from(document.querySelectorAll("iframe[src], script[src]"))
            .some(el => captchaRe.test(el.getAttribute("src") || "")) ||
            !!document.querySelector('[class*="captcha" i], [id*="captcha" i], .cf-turnstile, [class*="turnstile" i]');
        if (captchaEl) return "captcha";

        const verifyRe = /code|otp|2fa|token/i;
        const verifyInput = Array.from(document.querySelectorAll("input")).some(inp => {
            if (inp.name === "__cmtkn" || inp.type === "hidden") return false;
            return verifyRe.test(inp.name || "") || verifyRe.test(inp.id || "");
        });
        if (verifyInput) return "verification";

        const danger = Array.from(document.querySelectorAll(".alert-danger")).some(isVisible);
        if (danger) return "wrong-credentials";

        return "unknown";
    }

    /* ---------- sign-in attempt ---------- */

    function findLoginForm() {
        return Array.from(document.querySelectorAll("form"))
            .find(f => f.querySelector('input[type="password"]')) || null;
    }

    function setValue(input, value) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function recentAttemptElsewhere() {
        try {
            const at = Number(localStorage.getItem(ATTEMPT_AT_KEY) || 0);
            return Date.now() - at < ATTEMPT_COOLDOWN_MS;
        } catch (e) { return false; }
    }

    function attemptLogin() {
        const form = findLoginForm();
        if (!form) { fail("unknown"); return; }

        let action;
        try {
            action = new URL(form.getAttribute("action") || location.href, location.href);
        } catch (e) { fail("unknown"); return; }
        if (action.protocol !== "https:" || action.host !== "www.cardmarket.com") {
            fail("unknown");
            return;
        }

        const user = form.querySelector('input[name="username"]') ||
            form.querySelector('input[type="text"], input[type="email"]');
        const pass = form.querySelector('input[type="password"]');
        if (!user || !pass) { fail("unknown"); return; }

        ss("set", ATTEMPTED_KEY, "1");
        ss("set", RETURN_KEY, location.href);
        try { localStorage.setItem(ATTEMPT_AT_KEY, String(Date.now())); } catch (e) { /* ignore */ }

        showNotice("Signing you in…", "info");
        setValue(user, current.username);
        setValue(pass, current.password);

        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.submit();
    }

    /* ---------- logout detection ---------- */

    // Capture phase so paused is written before the navigation starts.
    document.addEventListener("click", e => {
        const link = e.target && e.target.closest && e.target.closest(LOGOUT_SELECTOR);
        if (link) updateRecord({ paused: true });
    }, true);

    document.addEventListener("submit", e => {
        if (e.target && e.target.matches && e.target.matches(LOGOUT_FORM_SELECTOR)) {
            updateRecord({ paused: true });
        }
    }, true);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.rememberMe) current = changes.rememberMe.newValue || null;
    });

    /* ---------- on load ---------- */

    chrome.storage.local.get("rememberMe", res => {
        current = res.rememberMe || null;
        const attempted = ss("get", ATTEMPTED_KEY) === "1";

        if (isLoggedIn()) {
            const returnTo = ss("get", RETURN_KEY);
            ss("del", ATTEMPTED_KEY);
            ss("del", RETURN_KEY);
            // A successful (manual or automatic) login resumes auto sign-in.
            if (current && current.paused) updateRecord({ paused: false });
            if (returnTo) {
                let target = null;
                try { target = new URL(returnTo); } catch (e) { /* ignore */ }
                if (target && target.origin === location.origin && target.href !== location.href) {
                    location.replace(target.href);
                }
            }
            return;
        }

        if (!current) {
            ss("del", ATTEMPTED_KEY);
            return;
        }

        if (attempted) {
            fail(classifyFailure());
            return;
        }

        const state = {
            enabled: !!current.enabled,
            hasCredentials: !!(current.username && current.password),
            loggedIn: false,
            paused: !!current.paused,
            failed: current.failed || null
        };
        if (!shouldAttemptLogin(state)) return;
        if (recentAttemptElsewhere()) return;

        attemptLogin();
    });
})();
