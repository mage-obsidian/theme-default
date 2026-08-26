import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome, NO_REASON, tally } from "./outcome.ts";

test("a passing test is passed", () => {
    assert.deepEqual(classifyOutcome("passed"), { outcome: "passed", reason: null });
});

test("a timeout is a failure, not an absence", () => {
    assert.equal(classifyOutcome("timedOut").outcome, "failed");
    assert.equal(classifyOutcome("interrupted").outcome, "failed");
});

test("a skipped test is not executed, and carries the reason it was skipped for", () => {
    const verdict = classifyOutcome("skipped", [
        { type: "skip", description: "needs a display: Chromium keeps nothing in the back/forward cache while headless" },
    ]);
    assert.equal(verdict.outcome, "not-executed");
    assert.match(verdict.reason ?? "", /needs a display/);
});

test("a fixme counts as not executed with its reason", () => {
    assert.equal(classifyOutcome("skipped", [{ type: "fixme", description: "the challenge is off in this environment" }]).outcome, "not-executed");
});

test("a skip with no reason says so rather than passing quietly", () => {
    assert.equal(classifyOutcome("skipped", []).reason, NO_REASON);
    assert.equal(classifyOutcome("skipped", [{ type: "skip", description: "   " }]).reason, NO_REASON);
});

test("a not-executed test never counts as passed", () => {
    const counts = tally([
        classifyOutcome("passed"),
        classifyOutcome("skipped", [{ type: "skip", description: "no display" }]),
        classifyOutcome("failed"),
    ]);
    assert.deepEqual(counts, { passed: 1, failed: 1, notExecuted: 1 });
});
