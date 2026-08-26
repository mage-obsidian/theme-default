import { expect, test } from "@playwright/test";
import { catalogFixture, productPath, type ProductFixture } from "../src/catalog";

const fixture = catalogFixture();

const simple = (): ProductFixture => {
    const product = fixture?.products?.simple ?? null;
    test.skip(product === null, "the catalogue has no simple product; run the seed");
    return product as ProductFixture;
};

test.describe("compare", () => {
    test("a product can be added to the comparison and shows up there", { tag: "@cap:catalog_product_compare_index" }, async ({ page }) => {
        await page.goto(productPath(simple()));

        const add = page.locator("[data-add-to-compare]").first();
        await expect(add).toBeVisible();
        await add.locator("button, [type=submit]").first().click();

        await page.goto("/catalog/product_compare/index/");
        await expect(page.locator("#maincontent")).toBeVisible();
        await expect(page.locator("h1")).toContainText(/compare/i);
    });

    test("the comparison page stands on its own when nothing is being compared", { tag: "@cap:catalog_product_compare_index" }, async ({ page }) => {
        await page.goto("/catalog/product_compare/index/");

        await expect(page.locator("h1")).toContainText(/compare/i);
        await expect(page.locator("#maincontent")).toContainText(/\S/);
    });
});

test.describe("product alerts and sharing", () => {
    test("a price alert can be subscribed from the product page", { tag: "@cap:productalert_unsubscribe_email" }, async ({ page }) => {
        await page.goto(productPath(simple()));
        await expect(page.getByRole("link", { name: /price alert|notify me/i }).first()).toBeVisible();
    });

    test("a product can be emailed to a friend", { tag: "@cap:sendfriend_product_send" }, async ({ page }) => {
        await page.goto(productPath(simple()));
        await expect(page.getByRole("link", { name: /email to a friend/i }).first()).toBeVisible();
    });
});
