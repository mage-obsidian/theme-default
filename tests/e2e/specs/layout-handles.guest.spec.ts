import { expect, test } from "@playwright/test";
import { catalogFixture, LISTING_PATH, productPath, SEARCH_PATH, type ProductFixture } from "../src/catalog";

const PAGES: Array<{ path: string; handle: string; bodyClass: string }> = [
    { path: "/", handle: "cms_index_index", bodyClass: "cms-index-index" },
    { path: LISTING_PATH, handle: "catalog_category_view", bodyClass: "catalog-category-view" },
    { path: SEARCH_PATH, handle: "catalogsearch_result_index", bodyClass: "catalogsearch-result-index" },
    { path: "/checkout/cart/", handle: "checkout_cart_index", bodyClass: "checkout-cart-index" },
    { path: "/customer/account/login", handle: "customer_account_login", bodyClass: "customer-account-login" },
    { path: "/customer/account/create", handle: "customer_account_create", bodyClass: "customer-account-create" },
    { path: "/contact/", handle: "contact_index_index", bodyClass: "contact-index-index" },
    { path: "/catalog/product_compare/index/", handle: "catalog_product_compare_index", bodyClass: "catalog-product_compare-index" },
    { path: "/sales/guest/form/", handle: "sales_guest_form", bodyClass: "sales-guest-form" },
];

test.describe("every page carries the layout handle it is built from", () => {
    for (const page_ of PAGES) {
        test(`${page_.handle} is applied on ${page_.path}`, { tag: `@cap:${page_.handle}` }, async ({ page }) => {
            const response = await page.goto(page_.path);
            expect(response?.status()).toBeLessThan(400);

            const classes = (await page.locator("body").getAttribute("class")) ?? "";
            expect(
                classes.split(/\s+/),
                `the body of ${page_.path} must carry the class its handle produces`,
            ).toContain(page_.bodyClass);
        });
    }

    test("a product page is built from catalog_product_view", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        const product = catalogFixture()?.products?.simple as ProductFixture | null;
        test.skip(product === null || product === undefined, "run the seed first");

        await page.goto(productPath(product as ProductFixture));
        const classes = (await page.locator("body").getAttribute("class")) ?? "";
        expect(classes.split(/\s+/)).toContain("catalog-product-view");
    });

    test("a missing route lands on the not-found handle, not on a blank page", { tag: "@cap:cms_noroute_index" }, async ({ page }) => {
        const response = await page.goto("/this-route-does-not-exist-at-all");
        expect(response?.status()).toBe(404);

        await expect(page.locator("#maincontent")).toContainText(/\S/);
    });
});
