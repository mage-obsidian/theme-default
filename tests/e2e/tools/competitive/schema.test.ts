import { test } from "node:test";
import assert from "node:assert/strict";
import {
    blockedReason,
    mayStartWork,
    validateBacklogItem,
    validateCapability,
    validateMigrationItem,
    type BacklogItem,
    type Capability,
    type MigrationItem,
} from "./schema.ts";

const capability = (overrides: Partial<Capability> = {}): Capability => ({
    id: "competitive/page-builder",
    capability: "Rendering Page Builder content",
    referenceModule: "Magento_PageBuilder",
    referenceTemplates: 11,
    state: "gap",
    regime: "derived-from-code",
    revisions: { "hyva-themes/magento2-default-theme": "3537b078" },
    evidence: "eleven renderers there, none here",
    gapId: "competitive/gap/page-builder",
    ...overrides,
});

const rules = (entry: Capability): string[] => validateCapability(entry).map((problem) => problem.rule);

test("a gap derived from code, with a pinned revision and a gap entry, passes", () => {
    assert.deepEqual(rules(capability()), []);
});

test("a comparison with no state is rejected", () => {
    assert.ok(rules(capability({ state: "unknown" as Capability["state"] })).includes("state-required"));
});

test("a comparison with no evidence regime is rejected", () => {
    assert.deepEqual(rules(capability({ regime: "hearsay" as Capability["regime"] })), ["regime-required"]);
});

test("a claim derived from code must pin the revision it came from", () => {
    assert.ok(rules(capability({ revisions: {} })).includes("revisions-required"));
});

test("a claim declared by its source must cite the source and the product version", () => {
    const problems = rules(capability({ regime: "declared-by-source", revisions: undefined }));
    assert.ok(problems.includes("source-required"));
});

test("a claim declared by its source passes once it cites both", () => {
    assert.deepEqual(
        rules(capability({ regime: "declared-by-source", revisions: undefined, source: "the vendor's product page", sourceVersion: "as listed on 2026-08-26" })),
        [],
    );
});

test("an equivalence must say where our path is", () => {
    assert.deepEqual(rules(capability({ state: "equivalent-by-another-path", gapId: undefined })), ["our-path-required"]);
});

test("a gap must point at the register entry that carries it", () => {
    assert.deepEqual(rules(capability({ gapId: "  " })), ["gap-entry-required"]);
});

const item = (overrides: Partial<BacklogItem> = {}): BacklogItem => ({
    id: "competitive/backlog/page-builder",
    title: "Render Page Builder content",
    capabilityId: "competitive/page-builder",
    priority: 1,
    effort: "large",
    criteria: ["a content team cannot launch without it"],
    dependsOn: [],
    approval: { state: "not-approved" },
    reimplementFromBehaviour: true,
    derivedFrom: "derived-from-code",
    ...overrides,
});

const itemRules = (entry: BacklogItem): string[] =>
    validateBacklogItem(entry, [capability()]).map((problem) => problem.rule);

test("a backlog item that starts not approved passes", () => {
    assert.deepEqual(itemRules(item()), []);
});

test("a backlog item with no approval state is rejected", () => {
    assert.ok(itemRules(item({ approval: undefined as unknown as BacklogItem["approval"] })).includes("approval-required"));
});

test("an approved item must record when it was decided", () => {
    assert.deepEqual(itemRules(item({ approval: { state: "approved" } })), ["approval-date-required"]);
});

test("an item pointing at a comparison nobody made is rejected", () => {
    assert.deepEqual(itemRules(item({ capabilityId: "competitive/invented" })), ["capability-required"]);
});

test("an item with no declared criteria is rejected", () => {
    assert.deepEqual(itemRules(item({ criteria: [] })), ["criteria-required"]);
});

test("anything derived from the reference's code must be marked for reimplementation", () => {
    assert.deepEqual(itemRules(item({ reimplementFromBehaviour: false })), ["reimplementation-required"]);
});

test("an item that depends on itself is rejected", () => {
    assert.deepEqual(itemRules(item({ dependsOn: ["competitive/backlog/page-builder"] })), ["self-dependency"]);
});

test("work cannot start on an item that is not approved, and the reason says why", () => {
    assert.equal(mayStartWork(item()), false);
    assert.match(blockedReason(item()) ?? "", /does not authorise incorporating/);
});

test("work may start once the item is approved with a date", () => {
    const approved = item({ approval: { state: "approved", decidedAt: "2026-08-26" } });
    assert.equal(mayStartWork(approved), true);
    assert.equal(blockedReason(approved), null);
});

const subject = (overrides: Partial<MigrationItem> = {}): MigrationItem => ({
    id: "migration/templates",
    subject: "Templates",
    verdict: "rewrite",
    assumption: "the store runs the reference's own theme",
    detail: "Alpine directives do not survive",
    ...overrides,
});

const subjectRules = (entry: MigrationItem): string[] => validateMigrationItem(entry).map((problem) => problem.rule);

test("a migration subject with a verdict and a declared assumption passes", () => {
    assert.deepEqual(subjectRules(subject()), []);
});

test("a migration subject with no declared assumption is rejected", () => {
    assert.deepEqual(subjectRules(subject({ assumption: " " })), ["assumption-required"]);
});

test("what has no equivalent must link to the gap entry that carries it", () => {
    assert.deepEqual(subjectRules(subject({ verdict: "no-equivalent" })), ["gap-link-required"]);
});

test("a subject with no verdict is rejected", () => {
    assert.ok(subjectRules(subject({ verdict: "maybe" as MigrationItem["verdict"] })).includes("verdict-required"));
});
