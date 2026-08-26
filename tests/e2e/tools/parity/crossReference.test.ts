import { test } from "node:test";
import assert from "node:assert/strict";
import { byCoreModule, crossReference, orphanDeclarations, summarise } from "./crossReference.ts";
import type { CoreHandle } from "./coreHandles.ts";

const core = (handle: string, module: string): CoreHandle => ({ handle, module, origin: "layout-file" });

test("a handle re-declared by an installed Obsidian module is declared", () => {
    const entries = crossReference(
        [core("multishipping_checkout_billing", "Magento_Multishipping")],
        [{ handle: "multishipping_checkout_billing", module: "MageObsidian_Multishipping" }],
        { optedIn: new Set(["MageObsidian_Multishipping"]) },
    );

    assert.equal(entries[0].status, "declared");
    assert.deepEqual(entries[0].declaredBy, ["MageObsidian_Multishipping"]);
});

test("a handle of a core module outside the contract that nobody re-declares is suppressed", () => {
    const entries = crossReference([core("sales_order_print", "Magento_Sales")], [], { optedIn: new Set(["MageObsidian_Sales"]) });

    assert.equal(entries[0].status, "suppressed");
    assert.deepEqual(entries[0].declaredBy, []);
});

test("a handle of a module that participates and is not re-declared stays untouched", () => {
    const entries = crossReference([core("some_handle", "MageObsidian_Storefront")], [], { optedIn: new Set(["MageObsidian_Storefront"]) });

    assert.equal(entries[0].status, "untouched");
});

test("two modules declaring the same handle are both recorded, sorted", () => {
    const entries = crossReference(
        [core("checkout_cart_index", "Magento_Checkout")],
        [
            { handle: "checkout_cart_index", module: "MageObsidian_Multishipping" },
            { handle: "checkout_cart_index", module: "MageObsidian_Checkout" },
        ],
        { optedIn: new Set(["MageObsidian_Checkout", "MageObsidian_Multishipping"]) },
    );

    assert.deepEqual(entries[0].declaredBy, ["MageObsidian_Checkout", "MageObsidian_Multishipping"]);
});

test("a duplicate declaration by the same module is recorded once", () => {
    const entries = crossReference(
        [core("checkout_cart_index", "Magento_Checkout")],
        [
            { handle: "checkout_cart_index", module: "MageObsidian_Checkout" },
            { handle: "checkout_cart_index", module: "MageObsidian_Checkout" },
        ],
        { optedIn: new Set(["MageObsidian_Checkout"]) },
    );

    assert.deepEqual(entries[0].declaredBy, ["MageObsidian_Checkout"]);
});

test("a declaration with no core handle behind it is reported as an orphan", () => {
    const orphans = orphanDeclarations(
        [core("customer_account", "Magento_Customer")],
        [
            { handle: "customer_account", module: "MageObsidian_Customer" },
            { handle: "obsidian_only_handle", module: "MageObsidian_Storefront" },
        ],
    );

    assert.deepEqual(orphans, [{ handle: "obsidian_only_handle", module: "MageObsidian_Storefront" }]);
});

test("summary counts every status", () => {
    const entries = crossReference(
        [core("a", "Magento_Sales"), core("b", "Magento_Sales"), core("c", "MageObsidian_Storefront")],
        [{ handle: "a", module: "MageObsidian_Sales" }],
        { optedIn: new Set(["MageObsidian_Storefront", "MageObsidian_Sales"]) },
    );

    assert.deepEqual(summarise(entries), { declared: 1, "declared-not-installed": 0, suppressed: 1, untouched: 1 });
});

test("entries group by their core module", () => {
    const entries = crossReference(
        [core("a", "Magento_Sales"), core("b", "Magento_Sales"), core("c", "Magento_Review")],
        [],
        { optedIn: new Set() },
    );

    const grouped = byCoreModule(entries);
    assert.equal(grouped.get("Magento_Sales")?.length, 2);
    assert.equal(grouped.get("Magento_Review")?.length, 1);
});

test("a handle declared only by a module the contract does not carry is not installed here", () => {
    const entries = crossReference(
        [core("multishipping_checkout_addresses", "Magento_Multishipping")],
        [{ handle: "multishipping_checkout_addresses", module: "MageObsidian_Multishipping" }],
        { optedIn: new Set(["MageObsidian_Checkout"]) },
    );

    assert.equal(entries[0].status, "declared-not-installed");
    assert.deepEqual(entries[0].declaredBy, ["MageObsidian_Multishipping"]);
});

test("an installed module wins over a dormant one declaring the same handle", () => {
    const entries = crossReference(
        [core("checkout_cart_index", "Magento_Checkout")],
        [
            { handle: "checkout_cart_index", module: "MageObsidian_Multishipping" },
            { handle: "checkout_cart_index", module: "MageObsidian_Checkout" },
        ],
        { optedIn: new Set(["MageObsidian_Checkout"]) },
    );

    assert.equal(entries[0].status, "declared");
    assert.deepEqual(entries[0].declaredBy, ["MageObsidian_Checkout"]);
});
