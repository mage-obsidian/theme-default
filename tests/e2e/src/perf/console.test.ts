import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyConsole, unusedAcceptances, type AcceptedNote, type ConsoleNote } from "./console.ts";

const accepted: AcceptedNote[] = [
    { page: "home", match: "wish list counter", reason: "the badge is seeded before its section arrives" },
    { page: "*", match: "Download the Vue Devtools", reason: "the framework's own development hint" },
];

const note = (overrides: Partial<ConsoleNote> = {}): ConsoleNote => ({
    page: "home",
    type: "warning",
    text: "the wish list counter disagreed with the section",
    ...overrides,
});

test("a declared warning is accepted with its reason", () => {
    const result = classifyConsole([note()], accepted);
    assert.equal(result.unexplained.length, 0);
    assert.equal(result.accepted[0].reason, "the badge is seeded before its section arrives");
});

test("a warning declared for one page is not accepted on another", () => {
    assert.equal(classifyConsole([note({ page: "plp" })], accepted).unexplained.length, 1);
});

test("a warning declared for every page is accepted anywhere", () => {
    const anywhere = note({ page: "checkout", text: "Download the Vue Devtools extension" });
    assert.equal(classifyConsole([anywhere], accepted).unexplained.length, 0);
});

test("a warning nobody declared is unexplained", () => {
    const fresh = note({ text: "Uncaught TypeError: cannot read property of undefined" });
    assert.deepEqual(classifyConsole([fresh], accepted).unexplained, [fresh]);
});

test("an acceptance that no longer fires is reported so the list does not rot", () => {
    assert.deepEqual(unusedAcceptances([note()], accepted).map((rule) => rule.match), ["Download the Vue Devtools"]);
});
