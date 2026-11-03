(function (root) {
    // Auto sign-in is attempted only when the user enabled "Remember me",
    // saved credentials, is currently logged out, did not log out manually
    // (paused), no earlier attempt failed and no attempt is still pending
    // (prevents login loops / lockout).
    function shouldAttemptLogin(state) {
        return !!(state && state.enabled && state.hasCredentials &&
            !state.loggedIn && !state.paused && !state.failed && !state.pendingAttempt);
    }

    const api = { shouldAttemptLogin };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
