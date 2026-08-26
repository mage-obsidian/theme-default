import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, exitCode, NO_STOREFRONT, render, tally, unmetDependency, type CheckResult } from "./checks.ts";

const result = (overrides: Partial<CheckResult> = {}): CheckResult => ({
    name: "unit",
    outcome: "passed",
    reason: null,
    gate: true,
    output: "",
    ...overrides,
});

test("every declared check says whether it gates and whether it needs a storefront", () => {
    assert.ok(CHECKS.length > 0);
    for (const check of CHECKS) {
        assert.equal(typeof check.gate, "boolean");
        assert.equal(typeof check.needsStorefront, "boolean");
        assert.ok(check.what.trim().length > 0);
    }
});

test("informative mode never fails, whatever happened", () => {
    const results = [result({ outcome: "failed" }), result({ name: "suite", outcome: "failed" })];
    assert.equal(exitCode(results, "informative"), 0);
});

test("gate mode fails on a gating check and names it", () => {
    const results = [result(), result({ name: "suite", outcome: "failed" })];
    assert.equal(exitCode(results, "gate"), 1);
    assert.deepEqual(tally(results).gatedFailures, ["suite"]);
});

test("a failing check that does not gate never fails the run", () => {
    const results = [result({ name: "diagnostic", outcome: "failed", gate: false })];
    assert.equal(exitCode(results, "gate"), 0);
});

test("a check that could not run is not a failure, and never counts as a pass", () => {
    const results = [result({ name: "suite", outcome: "not-executed", reason: NO_STOREFRONT })];
    assert.equal(exitCode(results, "gate"), 0);
    assert.deepEqual(tally(results), { passed: 0, failed: 0, notExecuted: 1, gatedFailures: [] });
});

test("the summary reports the three states and the reason a check did not run", () => {
    const text = render([result(), result({ name: "suite", outcome: "not-executed", reason: NO_STOREFRONT })]);
    assert.match(text, /1 passed · 0 failed · 1 not executed/);
    assert.match(text, /no storefront answered/);
    assert.match(text, /no gating check failed/);
});

test("a check whose dependency did not pass is not executed rather than run on a spent fixture", () => {
    const suite = CHECKS.find((check) => check.name === "suite")!;
    assert.equal(suite.dependsOn, "seed");
    const unmet = unmetDependency(suite, [result({ name: "seed", outcome: "failed" })]);
    assert.match(unmet ?? "", /seed did not pass/);
});

test("a check whose dependency passed runs", () => {
    const suite = CHECKS.find((check) => check.name === "suite")!;
    assert.equal(unmetDependency(suite, [result({ name: "seed" })]), null);
});

test("a check with no dependency always runs", () => {
    assert.equal(unmetDependency(CHECKS[0], []), null);
});
