const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldAttemptLogin } = require("../lib/auth-state.js");

const ok = { enabled: true, hasCredentials: true, loggedIn: false, paused: false, failed: null };

test("happy path attempts login", () => {
    assert.equal(shouldAttemptLogin(ok), true);
});

test("disabled does not attempt", () => {
    assert.equal(shouldAttemptLogin({ ...ok, enabled: false }), false);
});

test("missing credentials does not attempt", () => {
    assert.equal(shouldAttemptLogin({ ...ok, hasCredentials: false }), false);
});

test("already logged in does not attempt", () => {
    assert.equal(shouldAttemptLogin({ ...ok, loggedIn: true }), false);
});

test("paused (manual logout) does not attempt", () => {
    assert.equal(shouldAttemptLogin({ ...ok, paused: true }), false);
});

test("failed state does not attempt", () => {
    assert.equal(shouldAttemptLogin({ ...ok, failed: "captcha" }), false);
});
