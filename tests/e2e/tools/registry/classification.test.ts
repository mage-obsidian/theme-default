import { test } from "node:test";
import assert from "node:assert/strict";
import { applyClassification, unclassifiedSuppressed, type ClassificationRule } from "./classification.ts";
import type { RegistryEntry } from "./schema.ts";

const suppressed = (handle: string, overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
    id: `parity/magento-cms/${handle}`,
    capability: handle,
    origin: "parity",
    status: "uncovered",
    severity: "major",
    handles: [handle],
    evidence: { observation: "handle present in the core layout set and not re-declared by any MageObsidian module" },
    reason: "core handle neither re-declared nor covered by a test",
    ...overrides,
});

const rule: ClassificationRule = {
    match: ["robots_index_index"],
    status: "out-of-scope",
    severity: "informational",
    reason: "produces a non-HTML response",
};

test("a suppressed handle takes the status and reason of its rule", () => {
    const [entry] = applyClassification([suppressed("robots_index_index")], [rule]);
    assert.equal(entry.status, "out-of-scope");
    assert.equal(entry.severity, "informational");
    assert.match(entry.reason ?? "", /non-HTML/);
});

test("a rule carrying an unblock condition passes it through", () => {
    const blocking: ClassificationRule = { ...rule, match: ["paypal_express_review"], status: "blocked", unblockedBy: "a configured gateway" };
    const [entry] = applyClassification([suppressed("paypal_express_review")], [blocking]);
    assert.equal(entry.unblockedBy, "a configured gateway");
});

test("a handle no rule matches is left alone", () => {
    const [entry] = applyClassification([suppressed("cms_page_view")], [rule]);
    assert.equal(entry.status, "uncovered");
});

test("a declared handle is never reclassified, even if a rule names it", () => {
    const declared = suppressed("robots_index_index", {
        evidence: { observation: "handle re-declared by MageObsidian_Storefront" },
    });
    assert.equal(applyClassification([declared], [rule])[0].status, "uncovered");
});

test("a covered handle is never downgraded", () => {
    const covered = suppressed("robots_index_index", { status: "covered", tests: ["a.spec.ts:x"] });
    assert.equal(applyClassification([covered], [rule])[0].status, "covered");
});

test("a suppressed handle left uncovered without a gap-candidate reason is reported as unclassified", () => {
    const entries = applyClassification([suppressed("cms_page_view"), suppressed("robots_index_index")], [rule]);
    assert.deepEqual(unclassifiedSuppressed(entries).map((entry) => entry.handles?.[0]), ["cms_page_view"]);
});

test("a suppressed handle marked as a gap candidate counts as classified", () => {
    const entries = [suppressed("cms_page_view", { reason: "real gap candidate: nothing replaces it" })];
    assert.deepEqual(unclassifiedSuppressed(entries), []);
});
