import { test } from "node:test";
import assert from "node:assert/strict";
import {
    collectCoreHandles,
    countByModule,
    handleFromLayoutFile,
    moduleNameFromDeclaration,
    moduleNameFromDirectory,
    referencedHandles,
    type LayoutSource,
} from "./coreHandles.ts";

const fakeSource = (tree: Record<string, Record<string, string>>, names: Record<string, string> = {}): LayoutSource => ({
    listModuleDirectories: () => Object.keys(tree),
    readModuleName: (directory) => names[directory] ?? null,
    listLayoutFiles: (directory, area) =>
        area === "frontend" ? Object.keys(tree[directory] ?? {}) : [],
    readFile: (path) => {
        for (const files of Object.values(tree)) {
            if (path in files) {
                return files[path];
            }
        }
        return "";
    },
});

test("handle name is the layout file basename", () => {
    assert.equal(handleFromLayoutFile("/v/module-sales/view/frontend/layout/sales_order_view.xml"), "sales_order_view");
    assert.equal(handleFromLayoutFile("default.xml"), "default");
});

test("referenced handles are extracted and deduplicated", () => {
    const xml = `<page><update handle="customer_account"/><update handle="sales_order_view"/><update handle="customer_account"/></page>`;
    assert.deepEqual(referencedHandles(xml), ["customer_account", "sales_order_view"]);
});

test("a layout without references yields none", () => {
    assert.deepEqual(referencedHandles("<page><body/></page>"), []);
});

test("module name comes from its declaration when present", () => {
    assert.equal(moduleNameFromDeclaration('<config><module name="Magento_CatalogSearch" setup_version="1.0"/></config>'), "Magento_CatalogSearch");
    assert.equal(moduleNameFromDeclaration("<config/>"), null);
});

test("module name falls back to the directory convention", () => {
    assert.equal(moduleNameFromDirectory("/vendor/magento/module-catalog-search"), "Magento_CatalogSearch");
    assert.equal(moduleNameFromDirectory("module-sales"), "Magento_Sales");
});

test("collects handles from files and from references", () => {
    const handles = collectCoreHandles(
        fakeSource(
            {
                "module-sales": {
                    "module-sales/sales_order_view.xml": '<page><update handle="sales_order_history"/></page>',
                    "module-sales/sales_order_history.xml": "<page/>",
                },
            },
            { "module-sales": "Magento_Sales" },
        ),
    );

    assert.deepEqual(handles, [
        { handle: "sales_order_history", module: "Magento_Sales", origin: "layout-file" },
        { handle: "sales_order_view", module: "Magento_Sales", origin: "layout-file" },
    ]);
});

test("a referenced handle with no file of its own is kept as a reference", () => {
    const handles = collectCoreHandles(
        fakeSource(
            { "module-wishlist": { "module-wishlist/wishlist_index_index.xml": '<page><update handle="customer_account"/></page>' } },
            { "module-wishlist": "Magento_Wishlist" },
        ),
    );

    assert.deepEqual(handles.map((entry) => [entry.handle, entry.origin]), [
        ["customer_account", "handle-reference"],
        ["wishlist_index_index", "layout-file"],
    ]);
});

test("modules without frontend layouts are skipped", () => {
    const handles = collectCoreHandles(fakeSource({ "module-sales-sequence": {} }));
    assert.deepEqual(handles, []);
});

test("counts group by module", () => {
    const counts = countByModule([
        { handle: "a", module: "Magento_Sales", origin: "layout-file" },
        { handle: "b", module: "Magento_Sales", origin: "layout-file" },
        { handle: "c", module: "Magento_Review", origin: "layout-file" },
    ]);
    assert.equal(counts.get("Magento_Sales"), 2);
    assert.equal(counts.get("Magento_Review"), 1);
});
