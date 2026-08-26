import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilityOf, coverageFromTags, crossCheck, orphanBehaviours, orphanTags, parseListedTests, testKey, unexplainedAbsences, type ListedTest } from "./crossCheck.ts";
import type { RegistryEntry } from "./schema.ts";

const listed = (overrides: Partial<ListedTest> = {}): ListedTest => ({
    file: "account-orders.spec.ts",
    title: "shows order history",
    project: "desktop",
    pending: false,
    tags: [],
    ...overrides,
});

const entry = (overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
    id: "parity/magento-sales/sales_order_history",
    capability: "Order history",
    origin: "parity",
    status: "covered",
    severity: "informational",
    evidence: { observation: "exercised end to end" },
    tests: ["account-orders.spec.ts:shows order history"],
    platform: { distribution: "community", version: "2.4.9" },
    ...overrides,
});

const rules = (entries: RegistryEntry[], tests: ListedTest[]): string[] => crossCheck(entries, tests).map((problem) => problem.rule);

test("a covered entry whose test the runner lists passes", () => {
    assert.deepEqual(rules([entry()], [listed()]), []);
});

test("a covered entry pointing at a test that does not exist is reported", () => {
    assert.ok(rules([entry()], [listed({ title: "renamed" })]).includes("missing-test"));
});

test("a covered entry backed by a pending test is reported", () => {
    assert.ok(rules([entry()], [listed({ pending: true })]).includes("covered-by-pending-test"));
});

test("a pending test with no entry explaining it is reported", () => {
    const problems = crossCheck([], [listed({ file: "auth.guest.spec.ts", title: "renders the CAPTCHA challenge", pending: true })]);
    assert.deepEqual(problems.map((problem) => problem.rule), ["unexplained-pending"]);
    assert.equal(problems[0].id, "auth.guest.spec.ts:renders the CAPTCHA challenge");
});

test("a pending test explained by a blocked entry passes", () => {
    const blocked = entry({
        id: "parity/magento-captcha/captcha",
        status: "blocked",
        reason: "the login template has nowhere to put the challenge",
        unblockedBy: "a template slot for the challenge",
        tests: ["auth.guest.spec.ts:renders the CAPTCHA challenge"],
        platform: undefined,
    });

    assert.deepEqual(rules([blocked], [listed({ file: "auth.guest.spec.ts", title: "renders the CAPTCHA challenge", pending: true })]), []);
});

test("an entry that references a pending test but claims coverage is reported twice over", () => {
    const problems = rules([entry({ tests: ["auth.guest.spec.ts:x"] })], [listed({ file: "auth.guest.spec.ts", title: "x", pending: true })]);
    assert.ok(problems.includes("covered-by-pending-test"));
    assert.ok(problems.includes("pending-without-reason"));
});

test("test keys join file and title", () => {
    assert.equal(testKey({ file: "a.spec.ts", title: "does a thing" }), "a.spec.ts:does a thing");
});

test("the runner report is flattened, nested suites included", () => {
    const report = {
        suites: [
            {
                specs: [{ file: "a.spec.ts", title: "top level", tests: [{ projectName: "desktop", expectedStatus: "passed", annotations: [] }] }],
                suites: [
                    {
                        specs: [{ file: "b.spec.ts", title: "nested", tags: ["cap:x"], tests: [{ projectName: "guest", expectedStatus: "skipped", annotations: [{ type: "fixme" }] }] }],
                    },
                ],
            },
        ],
    };

    assert.deepEqual(parseListedTests(report), [
        { file: "a.spec.ts", title: "top level", project: "desktop", pending: false, tags: [] },
        { file: "b.spec.ts", title: "nested", project: "guest", pending: true, tags: ["cap:x"] },
    ]);
});

test("an empty report yields no tests", () => {
    assert.deepEqual(parseListedTests({}), []);
});

test("a capability tag is recognised, other tags are not", () => {
    assert.equal(capabilityOf("cap:sales_order_view"), "sales_order_view");
    assert.equal(capabilityOf("behaviour:form-key"), null);
});

test("coverage is derived from the tags of tests that actually run", () => {
    const coverage = coverageFromTags(
        [
            listed({ tags: ["cap:sales_order_view"] }),
            listed({ title: "pending one", tags: ["cap:sales_order_view"], pending: true }),
        ],
        (capability) => [`parity/magento-sales/${capability}`],
    );

    assert.deepEqual(coverage.get("parity/magento-sales/sales_order_view"), ["account-orders.spec.ts:shows order history"]);
});

test("one tag can cover the same handle declared by several modules", () => {
    const coverage = coverageFromTags([listed({ tags: ["cap:customer_account_create"] })], (capability) => [
        `parity/magento-customer/${capability}`,
        `parity/magento-multishipping/${capability}`,
    ]);

    assert.equal(coverage.size, 2);
});

test("a tag the registry does not know is an orphan, reported once", () => {
    const problems = orphanTags(
        [listed({ tags: ["cap:made_up"] }), listed({ title: "another", tags: ["cap:made_up"] })],
        new Set(["sales_order_view"]),
    );

    assert.deepEqual(problems.map((problem) => problem.rule), ["orphan-tag"]);
});

test("a behaviour tag is never an orphan capability", () => {
    assert.deepEqual(orphanTags([listed({ tags: ["behaviour:bfcache"] })], new Set()), []);
});

test("a behaviour tag the registry does not declare is reported", () => {
    const listed = [{ file: "x.spec.ts", title: "t", project: "guest", pending: false, tags: ["behaviour:invented"] }];
    const problems = orphanBehaviours(listed, new Set(["form-key"]));
    assert.deepEqual(problems.map((problem) => problem.rule), ["orphan-behaviour"]);
});

test("a behaviour tag the registry declares passes", () => {
    const listed = [{ file: "x.spec.ts", title: "t", project: "guest", pending: false, tags: ["behaviour:form-key"] }];
    assert.deepEqual(orphanBehaviours(listed, new Set(["form-key"])), []);
});

test("a check that did not run and said nothing about why is reported", () => {
    const problems = unexplainedAbsences([{ project: "guest", title: "t", reason: null }], []);
    assert.deepEqual(problems.map((problem) => problem.rule), ["unexplained-absence"]);
});

test("a check that did not run and names a register entry is accepted", () => {
    const entries = [{ id: "parity/magento-captcha/captcha-challenge" }] as Parameters<typeof unexplainedAbsences>[1];
    const absent = [{ project: "guest", title: "t", reason: "see parity/magento-captcha/captcha-challenge" }];
    assert.deepEqual(unexplainedAbsences(absent, entries), []);
});

test("a check that did not run and names nothing in the register is reported", () => {
    const entries = [{ id: "parity/magento-captcha/captcha-challenge" }] as Parameters<typeof unexplainedAbsences>[1];
    const absent = [{ project: "guest", title: "t", reason: "it felt slow today" }];
    assert.deepEqual(unexplainedAbsences(absent, entries).map((problem) => problem.rule), ["unexplained-absence"]);
});
