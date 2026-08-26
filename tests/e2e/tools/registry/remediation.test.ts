import { test } from "node:test";
import assert from "node:assert/strict";
import { resolves, startable, validateRemediation, type ProposedChange } from "./remediation.ts";

const ids = new Set(["parity/magento-sales/email-items-missing", "competitive/gap/page-builder"]);
const backlogFor = new Map([["competitive/gap/page-builder", "competitive/backlog/page-builder"]]);

const change = (overrides: Partial<ProposedChange> = {}): ProposedChange => ({
    order: 1,
    name: "fix-transactional-email-contents",
    why: "the emails come out empty",
    motivatedBy: ["parity/magento-sales/email-items-missing"],
    kind: "defect",
    needsApprovalFirst: false,
    ...overrides,
});

const rules = (changes: ProposedChange[], approved = new Set<string>()): string[] =>
    validateRemediation(changes, ids, approved, backlogFor).map((problem) => problem.rule);

test("a change motivated by a real entry passes", () => {
    assert.deepEqual(rules([change()]), []);
});

test("a change that names no motivation is rejected", () => {
    assert.deepEqual(rules([change({ motivatedBy: [] })]), ["motivation-required"]);
});

test("a change motivated by an entry nobody wrote is rejected", () => {
    assert.deepEqual(rules([change({ motivatedBy: ["parity/invented/thing"] })]), ["unknown-motivation"]);
});

test("a motivation naming a whole track resolves through its entries", () => {
    assert.equal(resolves("parity/magento-sales", ids), true);
    assert.equal(resolves("parity/magento-nothing", ids), false);
});

test("two changes cannot claim the same position", () => {
    assert.deepEqual(rules([change(), change({ name: "other" })]), ["duplicate-order"]);
});

test("a change that closes a competitive gap has to be flagged as needing approval", () => {
    const gap = change({ kind: "gap", motivatedBy: ["competitive/gap/page-builder"], needsApprovalFirst: false });
    assert.deepEqual(rules([gap]), ["approval-flag-required"]);
});

test("a competitive change cannot be started while its backlog item is unapproved", () => {
    const gap = change({ kind: "gap", motivatedBy: ["competitive/gap/page-builder"], needsApprovalFirst: true });
    assert.equal(startable(gap, new Set(), backlogFor), false);
});

test("a competitive change becomes startable once its backlog item is approved", () => {
    const gap = change({ kind: "gap", motivatedBy: ["competitive/gap/page-builder"], needsApprovalFirst: true });
    assert.equal(startable(gap, new Set(["competitive/backlog/page-builder"]), backlogFor), true);
});

test("a change that needs no approval is always startable", () => {
    assert.equal(startable(change(), new Set(), backlogFor), true);
});
