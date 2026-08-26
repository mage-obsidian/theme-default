import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRuns, drift, PROTOCOLS, protocolById, RequestLedger } from "./protocol.ts";

const protocol = PROTOCOLS["warm-guest-desktop"];

test("an undeclared protocol cannot be measured under", () => {
    assert.throws(() => protocolById("whatever"), /unknown protocol/);
});

test("two runs inside the declared tolerance diverge on nothing", () => {
    const first = { ttfb: 120, fcp: 900, lcp: 1400, cls: 0.02, transferTotal: 480_000 };
    const second = { ttfb: 150, fcp: 1000, lcp: 1500, cls: 0.03, transferTotal: 490_000 };
    assert.deepEqual(compareRuns(first, second, protocol), []);
});

test("a run outside the declared tolerance is reported with its drift", () => {
    const first = { ttfb: 120, fcp: 900, lcp: 1400, cls: 0.02, transferTotal: 480_000 };
    const second = { ttfb: 120, fcp: 900, lcp: 1400, cls: 0.02, transferTotal: 900_000 };
    const divergences = compareRuns(first, second, protocol);
    assert.deepEqual(divergences.map((d) => d.metric), ["transferTotal"]);
    assert.ok(divergences[0].drift > divergences[0].tolerance);
});

test("a metric missing from one run is not compared", () => {
    assert.deepEqual(compareRuns({ lcp: 1400 }, {}, protocol), []);
});

test("drift is symmetric and bounded below by one unit", () => {
    assert.equal(drift(100, 200), drift(200, 100));
    assert.equal(drift(0, 0), 0);
});

test("a cold url is one the instrumentation has never asked for", () => {
    const ledger = new RequestLedger();
    const first = ledger.coldUrl("/gear/bags.html");
    ledger.record(first);
    const second = ledger.coldUrl("/gear/bags.html");
    assert.notEqual(first, second);
    assert.ok(!ledger.hasAsked(second));
});

test("a cold url that repeats one already requested is refused", () => {
    const ledger = new RequestLedger();
    const url = ledger.coldUrl("/gear/bags.html", "fixed");
    ledger.record(url);
    const again = new RequestLedger();
    again.record(url);
    assert.throws(() => again.coldUrl("/gear/bags.html", "fixed"), /already requested/);
});

test("a cold url keeps an existing query string", () => {
    const url = new RequestLedger().coldUrl("/catalogsearch/result/?q=bag");
    assert.ok(url.startsWith("/catalogsearch/result/?q=bag&"));
});
