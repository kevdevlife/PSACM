const test = require("node:test");
const assert = require("node:assert/strict");
const { cookieRecord, addCookieRecord, cookieSetDetails } = require("../lib/cookie-record.js");

const cookie = {
    name: "PHPSESSID", value: "secret", domain: "www.cardmarket.com", path: "/",
    storeId: "0", hostOnly: true, secure: true, httpOnly: true, sameSite: "lax", session: true
};

test("record keeps identity and flags but never the value", () => {
    const r = cookieRecord(cookie);
    assert.equal(r.value, undefined);
    assert.deepEqual(r, {
        name: "PHPSESSID", domain: "www.cardmarket.com", path: "/", storeId: "0",
        hostOnly: true, secure: true, httpOnly: true, sameSite: "lax"
    });
});

test("adding the same cookie twice keeps one record", () => {
    let list = addCookieRecord([], cookieRecord(cookie));
    list = addCookieRecord(list, cookieRecord(cookie));
    list = addCookieRecord(list, cookieRecord({ ...cookie, name: "other" }));
    assert.equal(list.length, 2);
    assert.equal(addCookieRecord(undefined, cookieRecord(cookie)).length, 1);
});

test("set details without expirationDate make a session cookie", () => {
    const d = cookieSetDetails(cookieRecord(cookie), "v");
    assert.equal("expirationDate" in d, false);
    assert.equal(d.value, "v");
    assert.equal(d.url, "https://www.cardmarket.com/");
    assert.equal("domain" in d, false, "host-only cookie gets no domain");
});

test("set details with expirationDate and a domain cookie", () => {
    const d = cookieSetDetails({ ...cookie, hostOnly: false, domain: ".cardmarket.com" }, "v", 123);
    assert.equal(d.expirationDate, 123);
    assert.equal(d.domain, ".cardmarket.com");
});
