import { test } from "node:test";
import assert from "node:assert/strict";
import { isApprovedForWork, validateEntry, validateRegistry, type RegistryEntry } from "./schema.ts";

const base = (overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
    id: "parity/magento-sales/sales_order_view",
    capability: "Order view",
    origin: "parity",
    status: "uncovered",
    severity: "major",
    evidence: { observation: "handle present in core, not re-declared" },
    reason: "not migrated yet",
    ...overrides,
});

const rules = (entry: RegistryEntry): string[] => validateEntry(entry).map((problem) => problem.rule);

test("a well formed entry passes", () => {
    assert.deepEqual(rules(base()), []);
});

test("an entry without evidence is rejected", () => {
    assert.ok(rules(base({ evidence: { observation: "   " } })).includes("evidence-required"));
});

test("a blocked entry without an unblock condition is rejected", () => {
    const problems = rules(base({ status: "blocked", reason: "no gateway credentials" }));
    assert.ok(problems.includes("unblock-condition-required"));
});

test("a blocked entry naming its unblock condition passes", () => {
    assert.deepEqual(rules(base({ status: "blocked", reason: "no gateway credentials", unblockedBy: "Braintree sandbox credentials" })), []);
});

test("a status that is not covered must explain itself", () => {
    assert.ok(rules(base({ status: "out-of-scope", reason: undefined })).includes("reason-required"));
});

test("a covered entry must name a test and a platform", () => {
    const problems = rules(base({ status: "covered", reason: undefined }));
    assert.ok(problems.includes("covered-needs-test"));
    assert.ok(problems.includes("platform-required"));
});

test("a covered entry with test and platform passes", () => {
    const entry = base({
        status: "covered",
        reason: undefined,
        tests: ["account-orders.spec.ts:order view"],
        platform: { distribution: "community", version: "2.4.9" },
    });
    assert.deepEqual(rules(entry), []);
});

test("a resolved entry must name the verification that proves it", () => {
    assert.ok(rules(base({ status: "resolved", reason: undefined })).includes("resolution-evidence-required"));
});

test("a competitive claim without an evidence regime is rejected", () => {
    const problems = rules(base({ id: "competitive/x", origin: "competitive", status: "uncovered", reason: "gap" }));
    assert.ok(problems.includes("evidence-regime-required"));
});

test("a claim derived from code must pin both revisions", () => {
    const entry = base({
        id: "competitive/x",
        origin: "competitive",
        reason: "gap",
        evidence: { observation: "present in the reference theme", regime: "derived-from-code", revisions: { reference: "abc123" } },
        approval: { state: "not-approved" },
    });
    assert.ok(rules(entry).includes("revisions-required"));
});

test("a claim derived from code with both revisions passes", () => {
    const entry = base({
        id: "competitive/x",
        origin: "competitive",
        reason: "gap",
        evidence: { observation: "present in the reference theme", regime: "derived-from-code", revisions: { reference: "abc123", obsidian: "def456" } },
        approval: { state: "not-approved" },
    });
    assert.deepEqual(rules(entry), []);
});

test("a claim declared by its source must cite source and product version", () => {
    const entry = base({
        id: "competitive/y",
        origin: "competitive",
        reason: "gap",
        evidence: { observation: "described in product material", regime: "declared-by-source", source: "https://example.test/docs" },
        approval: { state: "not-approved" },
    });
    assert.ok(rules(entry).includes("source-required"));
});

test("a competitive entry must carry an approval state", () => {
    const entry = base({
        id: "competitive/z",
        origin: "competitive",
        reason: "gap",
        evidence: { observation: "o", regime: "derived-from-code", revisions: { reference: "a", obsidian: "b" } },
    });
    assert.ok(rules(entry).includes("approval-required"));
});

test("an approved entry must record when it was decided", () => {
    const entry = base({
        id: "competitive/z",
        origin: "competitive",
        reason: "gap",
        evidence: { observation: "o", regime: "derived-from-code", revisions: { reference: "a", obsidian: "b" } },
        approval: { state: "approved" },
    });
    assert.ok(rules(entry).includes("approval-date-required"));
});

test("work is blocked on a competitive entry that is not approved", () => {
    const entry = base({
        id: "competitive/z",
        origin: "competitive",
        reason: "gap",
        evidence: { observation: "o", regime: "derived-from-code", revisions: { reference: "a", obsidian: "b" } },
        approval: { state: "not-approved" },
    });
    assert.equal(isApprovedForWork(entry), false);
    assert.equal(isApprovedForWork({ ...entry, approval: { state: "approved", decidedAt: "2026-08-26" } }), true);
});

test("a parity entry never needs approval to be worked on", () => {
    assert.equal(isApprovedForWork(base()), true);
});

test("duplicate ids are reported", () => {
    const problems = validateRegistry([base(), base()]).map((problem) => problem.rule);
    assert.ok(problems.includes("duplicate-id"));
});

const perf = (overrides: Partial<RegistryEntry> = {}): RegistryEntry =>
    base({
        id: "performance/catalog_category_view/query-cost",
        origin: "performance",
        status: "covered",
        tests: ["perf-queries.perf.spec.ts:plp renders inside its query ceiling"],
        evidence: { observation: "183 queries on a cold render", confirmed: true },
        ...overrides,
    });

test("a performance claim must say whether its attribution was confirmed", () => {
    assert.ok(rules(perf({ evidence: { observation: "153 of 207 come from the menu" } })).includes("attribution-confirmation-required"));
});

test("a confirmed performance claim passes", () => {
    assert.deepEqual(rules(perf()), []);
});

test("an unconfirmed attribution must name what would settle it", () => {
    const problems = rules(perf({ evidence: { observation: "looks like the menu", confirmed: false }, reason: undefined }));
    assert.ok(problems.includes("confirmation-path-required"));
});

test("an unconfirmed attribution that names its instrumentation is accepted", () => {
    assert.deepEqual(
        rules(perf({ evidence: { observation: "looks like the menu", confirmed: false }, reason: "instrument MenuTree::load and count the url_rewrite lookups it issues" })),
        [],
    );
});
