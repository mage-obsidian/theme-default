import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetFrom, ceilingFor, checkBudgets, queryBudgetFrom, validateBudgets, type BudgetsDocument } from "./budgets.ts";

const document = (overrides: Record<string, unknown> = {}): BudgetsDocument =>
    ({
        schemaVersion: 1,
        pages: {
            home: {
                path: "/",
                protocol: "warm-guest-desktop",
                metrics: { lcp: { ceiling: 2500, measured: 1800, measuredAt: "2026-08-26" } },
                ...overrides,
            },
        },
    }) as BudgetsDocument;

const rules = (doc: BudgetsDocument): string[] => validateBudgets(doc).map((v) => v.rule);

test("a budget backed by a dated measurement passes", () => {
    assert.deepEqual(rules(document()), []);
});

test("a ceiling with no measurement behind it is rejected", () => {
    assert.deepEqual(rules(document({ metrics: { lcp: { ceiling: 2500 } } })), ["ceiling-without-measurement"]);
});

test("a measurement with no date is rejected", () => {
    assert.deepEqual(rules(document({ metrics: { lcp: { ceiling: 2500, measured: 1800 } } })), [
        "measurement-without-date",
    ]);
});

test("a ceiling under its own measurement is rejected", () => {
    const problems = rules(document({ metrics: { lcp: { ceiling: 1000, measured: 1800, measuredAt: "2026-08-26" } } }));
    assert.deepEqual(problems, ["ceiling-below-measurement"]);
});

test("a page measured under a protocol nobody declared is rejected", () => {
    assert.deepEqual(rules(document({ protocol: "made-up" })), ["unknown-protocol"]);
});

test("a page that names no protocol is rejected", () => {
    assert.deepEqual(rules(document({ protocol: "" })), ["protocol-required"]);
});

test("a query ceiling is held to the same evidence rule", () => {
    assert.deepEqual(rules(document({ queries: { ceiling: 240, serverCache: "cold" } })), ["ceiling-without-measurement"]);
});

test("a query ceiling that does not name its server cache state is rejected", () => {
    const problems = rules(document({ queries: { ceiling: 240, measured: 183, measuredAt: "2026-08-26" } }));
    assert.deepEqual(problems, ["server-cache-state-required"]);
});

test("a measurement over the ceiling names the metric, the value and the ceiling", () => {
    const overruns = checkBudgets(document(), { home: { lcp: 3100 } });
    assert.equal(overruns.length, 1);
    assert.equal(overruns[0].message, "home: lcp measured 3100, ceiling 2500");
});

test("a page with no measurement is not judged", () => {
    assert.deepEqual(checkBudgets(document(), {}), []);
});

test("a ceiling derived from a measurement always clears it", () => {
    for (const measured of [0, 2, 200, 1800, 240_000]) {
        for (const metric of ["ttfb", "lcp", "transferTotal"]) {
            assert.ok(ceilingFor(metric, measured) > measured, `${metric} at ${measured}`);
        }
    }
});

test("a near-zero measurement gets a ceiling with room to breathe", () => {
    assert.equal(ceilingFor("ttfb", 2), 55);
    assert.equal(ceilingFor("cls", 0), 0.02);
});

test("a metric with no declared headroom cannot get a ceiling", () => {
    assert.throws(() => ceilingFor("madeUp", 10), /no headroom rule/);
});

test("a budget derived from a run validates against its own schema", () => {
    const derived = budgetFrom("/", "warm-guest-desktop", { ttfb: 2, lcp: 300, cls: 0, transferTotal: 199_000 }, "2026-08-26");
    assert.deepEqual(validateBudgets({ schemaVersion: 1, pages: { home: derived } }), []);
});

test("a query ceiling derived from a measurement clears it with room", () => {
    const backed = queryBudgetFrom(183, "2026-08-26", "cold");
    assert.ok(backed.ceiling > 183);
    assert.equal(backed.measured, 183);
    assert.equal(backed.serverCache, "cold");
});

test("a page over its query ceiling is reported like any other metric", () => {
    const doc = document({ queries: { ceiling: 230, measured: 183, measuredAt: "2026-08-26", serverCache: "cold" } });
    const overruns = checkBudgets(doc, { home: { queries: 401 } });
    assert.equal(overruns[0].message, "home: queries measured 401, ceiling 230");
});

test("a page with a query ceiling and no query measurement is not judged on it", () => {
    const doc = document({ queries: { ceiling: 230, measured: 183, measuredAt: "2026-08-26", serverCache: "cold" } });
    assert.deepEqual(checkBudgets(doc, { home: { lcp: 100 } }), []);
});
