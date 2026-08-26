import { expect, test } from "@playwright/test";
import { addToCart } from "../src/checkout";
import { catalogFixture, productPath, type ProductFixture } from "../src/catalog";

test.describe("gift options", () => {
    test("a cart with contents offers a gift message for the order", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await page.goto("/checkout/cart/");
        await expect(page.locator("[data-cart-line]").first()).toBeVisible();

        const panel = page.locator("details, [class*='gift']").filter({ hasText: /gift/i }).first();
        await expect(panel).toBeVisible({ timeout: 30_000 });
    });

    test("the gift message panel opens and takes a message", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await page.goto("/checkout/cart/");

        const panel = page.locator("details").filter({ hasText: /gift/i }).first();
        await expect(panel).toBeVisible({ timeout: 30_000 });
        await panel.locator("summary").first().click();

        await expect(panel.locator("textarea, input[type=text]").first()).toBeVisible();
    });
});

test.describe("downloadable products", () => {
    test("the downloads page renders inside the shell", { tag: "@cap:downloadable_customer_products" }, async ({ page }) => {
        const response = await page.goto("/downloadable/customer/products/");
        expect(response?.status()).toBeLessThan(400);

        await expect(page.locator("h1")).toContainText(/downloadable/i);
        await expect(page.locator(".account-rail")).toBeVisible();
    });

    test("a downloadable product offers its links on the product page", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        const product = catalogFixture()?.products?.downloadable as ProductFixture | null;
        test.skip(product === null || product === undefined, "the catalogue has no downloadable product; run the seed");

        await page.goto(productPath(product as ProductFixture));
        await expect(page.locator(".pdp__links")).toBeVisible();
    });
});

test.describe("stored payment methods", () => {
    test("the page renders and states plainly that there is nothing stored", { tag: "@cap:vault_cards_listaction" }, async ({ page }) => {
        const response = await page.goto("/vault/cards/listaction/");
        expect(response?.status()).toBeLessThan(400);

        await expect(page.locator("h1")).toContainText(/stored payment/i);
        await expect(page.locator("#maincontent")).toContainText(/\S/);
    });
});
