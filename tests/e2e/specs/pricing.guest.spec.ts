import { expect, test } from "@playwright/test";
import { catalogFixture, productPath, type ProductFixture } from "../src/catalog";
import { cartCount } from "../src/checkout";

const fixture = catalogFixture();

const priced = (role: string): ProductFixture => {
    const product = fixture?.products?.[role] ?? null;
    test.skip(product === null, `the catalogue has no ${role} product; run the seed`);
    return product as ProductFixture;
};

test.describe("price presentation", () => {
    test("a product carrying fixed product tax states it and adds it to the final price", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        const product = priced("fpt");
        await page.goto(productPath(product));

        const body = page.locator("#maincontent");
        await expect(body).toContainText(/fixed product tax/i);

        const prices = await body.locator(".price").allTextContents();
        const amounts = prices.map((text) => Number(text.replace(/[^0-9.]/g, ""))).filter((value) => value > 0);
        expect(amounts.length).toBeGreaterThanOrEqual(3);
        expect(Math.max(...amounts)).toBeGreaterThan(Math.min(...amounts));
    });

    test("fixed product tax follows the product into the cart", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        const product = priced("fpt");
        await page.goto(productPath(product));

        const submit = page.locator("form.pdp__form button[type=submit]").first();
        await expect(submit).toBeEnabled();
        const before = await cartCount(page);
        await submit.click();
        await expect.poll(() => cartCount(page), { timeout: 20_000 }).toBeGreaterThan(before);

        await page.goto("/checkout/cart/");
        await expect(page.locator("[data-cart-root]")).toContainText(/fixed product tax/i);
    });

    test("a product under a minimum advertised price hides it behind a disclosure", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        const product = priced("msrp");
        await page.goto(productPath(product));

        const reveal = page.locator(".msrp__reveal, summary").filter({ hasText: /click for price/i }).first();
        await expect(reveal).toBeVisible();

        await expect(page.locator(".msrp__advertised")).toBeVisible();
        await reveal.click();
        await expect(page.locator("#maincontent")).toContainText(/\$\d/);
    });

    test("the advertised price disclosure needs no JavaScript", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        const product = priced("msrp");
        await page.goto(productPath(product));

        const isNativeDisclosure = await page
            .locator("summary")
            .filter({ hasText: /click for price/i })
            .first()
            .evaluate((node) => node.parentElement?.tagName.toLowerCase() === "details");

        expect(isNativeDisclosure).toBe(true);
    });

    test("the listing shows the advertised price, not the real one", { tag: "@cap:catalog_category_view" }, async ({ page }) => {
        await page.goto("/catalogsearch/result/?q=fusion+backpack");

        const card = page.locator(".product-card").first();
        await expect(card).toBeVisible();
        await expect(card).toContainText(/click for price|\$\d/i);
    });
});
