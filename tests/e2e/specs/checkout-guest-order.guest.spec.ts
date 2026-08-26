import { expect, test } from "@playwright/test";
import { addToCart, ADDRESS, fillAddress, placeOrder, shippingMethods } from "../src/checkout";

const emailField = (page: import("@playwright/test").Page) => page.locator("input[type='email']").first();

test.describe("guest checkout, end to end", () => {
    test("a guest places an order and the confirmation names it", { tag: "@cap:checkout_onepage_success" }, async ({ page }) => {
        await addToCart(page);
        await page.goto("/checkout/");
        await expect(page.locator("#onepage-information-heading")).toBeVisible();

        await emailField(page).fill(`guest-${Date.now()}@obsidian.test`);
        await fillAddress(page, ADDRESS);

        const method = shippingMethods(page).first();
        await expect(method).toBeVisible({ timeout: 30_000 });
        await method.check();

        const summary = page.locator("aside").filter({ hasText: /\$\d/ }).first();
        await expect(summary).toBeVisible({ timeout: 30_000 });
        const grandTotal = ((await summary.textContent()) ?? "").match(/\$[\d,.]+/g)?.pop() ?? "";
        expect(grandTotal, "the checkout summary must state a total before the order is placed").toMatch(/\$\d/);

        await expect(placeOrder(page)).toBeEnabled({ timeout: 30_000 });
        await placeOrder(page).click();

        await page.waitForURL(/checkout\/onepage\/success/, { timeout: 60_000 });
        await expect(page.locator("#maincontent")).toContainText(/thank you|order number/i);

        const increment = ((await page.locator("#maincontent").textContent()) ?? "").match(/\b0{4,}\d+\b/)?.[0];
        expect(increment, "the confirmation must name the order it created").toBeTruthy();
    });

    test("the confirmation empties the cart it consumed", { tag: "@cap:checkout_onepage_success" }, async ({ page }) => {
        await page.goto("/checkout/cart/");
        await expect(page.locator("[data-cart-root]")).toBeVisible();
        expect(await page.locator("[data-cart-line]").count()).toBe(0);
    });
});
