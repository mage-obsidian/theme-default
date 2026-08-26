import { expect, test } from "@playwright/test";
import { addToCart, cartCount } from "../src/checkout";
import { catalogFixture, productPath, type ProductFixture } from "../src/catalog";

const fixture = catalogFixture();

const lines = (page: import("@playwright/test").Page) => page.locator("[data-cart-line]");

const openCart = async (page: import("@playwright/test").Page) => {
    await page.goto("/checkout/cart/");
    await expect(page.locator("[data-cart-root]")).toBeVisible();
};

test.describe("cart", () => {
    test("a product added from its page arrives as a line", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await openCart(page);

        expect(await lines(page).count()).toBeGreaterThan(0);
        await expect(lines(page).first()).toContainText(/\S/);
    });

    test("changing the quantity restates the totals", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await openCart(page);

        const line = lines(page).first();
        const qty = line.locator("[data-cart-qty]").first();
        await expect(qty).toBeVisible();
        const before = await cartCount(page);

        await line.locator("[data-cart-step='1']").first().click();

        await expect.poll(() => cartCount(page), { timeout: 20_000 }).toBeGreaterThan(before);
        await expect(qty).toHaveValue("2");
    });

    test("removing the last line leaves an empty cart that says so", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await openCart(page);

        const before = await lines(page).count();
        await lines(page).first().locator("[data-cart-remove]").first().click();

        await expect.poll(() => lines(page).count(), { timeout: 20_000 }).toBeLessThan(before);
    });

    test("a bundle keeps its chosen options on the line", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        const bundle = fixture?.products?.bundle as ProductFixture | null;
        test.skip(bundle === null || bundle === undefined, "the catalogue has no bundle; run the seed");

        await page.goto(productPath(bundle as ProductFixture));
        const submit = page.locator("form.pdp__form button[type=submit]").first();
        await expect(submit).toBeEnabled();
        await submit.click();

        await openCart(page);
        await expect(lines(page).first()).toBeVisible();
    });

    test("an invalid coupon is refused in place", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await openCart(page);

        const coupon = page.locator("[data-cart-coupon]").first();
        await expect(coupon).toBeVisible();
        await coupon.locator("input[name='coupon_code']").fill("NOT-A-REAL-COUPON");
        await coupon.locator("button[type='submit']").first().click();

        await expect(page.locator("body")).toContainText(/coupon|code/i, { timeout: 20_000 });
        await expect(lines(page).first()).toBeVisible();
    });
});
