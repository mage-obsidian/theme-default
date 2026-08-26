import { test } from "node:test";
import assert from "node:assert/strict";
import { buildParityEntries, classify, entryId } from "./buildParityEntries.ts";
import { validateRegistry } from "./schema.ts";
import type { ParityEntry } from "../parity/crossReference.ts";

const platform = { distribution: "community", version: "2.4.9" };
const parity = (overrides: Partial<ParityEntry> = {}): ParityEntry => ({
    handle: "sales_order_view",
    coreModule: "Magento_Sales",
    status: "suppressed",
    declaredBy: [],
    ...overrides,
});

test("ids are stable and derived from module and handle", () => {
    assert.equal(entryId(parity()), "parity/magento-sales/sales_order_view");
});

test("a handle with a covering test is covered", () => {
    assert.equal(classify(parity(), ["a.spec.ts:x"]).status, "covered");
});

test("a re-declared handle with no test is uncovered, not covered", () => {
    const classification = classify(parity({ status: "declared", declaredBy: ["MageObsidian_Sales"] }), []);
    assert.equal(classification.status, "uncovered");
    assert.match(classification.reason ?? "", /no test exercises it/);
});

test("a renderer handle is out of scope with its reason", () => {
    const classification = classify(parity({ handle: "checkout_cart_item_renderers" }), []);
    assert.equal(classification.status, "out-of-scope");
    assert.match(classification.reason ?? "", /renderer declaration/);
});

test("a suppressed screen handle stays uncovered", () => {
    assert.equal(classify(parity(), []).status, "uncovered");
});

test("covered entries carry their tests and platform", () => {
    const entries = buildParityEntries([parity()], new Map([["parity/magento-sales/sales_order_view", ["a.spec.ts:x"]]]), platform);
    assert.deepEqual(entries[0].tests, ["a.spec.ts:x"]);
    assert.deepEqual(entries[0].platform, platform);
});

test("uncovered entries carry no platform claim", () => {
    const entries = buildParityEntries([parity()], new Map(), platform);
    assert.equal(entries[0].platform, undefined);
});

test("every generated entry validates against the schema", () => {
    const entries = buildParityEntries(
        [
            parity(),
            parity({ handle: "checkout_cart_item_renderers", coreModule: "Magento_Checkout" }),
            parity({ handle: "customer_account", coreModule: "Magento_Customer", status: "declared", declaredBy: ["MageObsidian_Customer"] }),
        ],
        new Map([["parity/magento-sales/sales_order_view", ["a.spec.ts:x"]]]),
        platform,
    );

    assert.deepEqual(validateRegistry(entries), []);
});

test("a handle declared by a module this platform lacks is blocked, not declared", () => {
    const classification = classify(parity({ status: "declared-not-installed", declaredBy: ["MageObsidian_Multishipping"] }), []);
    assert.equal(classification.status, "blocked");
    assert.match(classification.reason ?? "", /does not carry/);
});
