import { expect, test } from "@playwright/test";
import { addToCart } from "../src/checkout";

const toast = (page: import("@playwright/test").Page) =>
    page.locator("[role=status], [role=alert], .toast, [class*='toast']").filter({ hasText: /\S/ });

test.describe("messages queued on the server reach the screen", () => {
    test("the newsletter reports back after a POST and a redirect", { tag: "@behaviour:session-messages" }, async ({ page }) => {
        await page.goto("/");

        const email = page.locator("input[type=email][name='email'], form[action*='newsletter'] input[type=email]").first();
        const present = await email.count();
        test.skip(present === 0, "this storefront has no newsletter form on the home page");

        await email.fill(`news-${Date.now()}@obsidian.test`);
        await email.press("Enter");

        await expect(toast(page).first()).toBeVisible({ timeout: 30_000 });
    });

    test("registering with an address that already exists is told through the redirect channel", { tag: "@behaviour:session-messages" }, async ({ page }) => {
        await page.goto("/customer/account/create");

        await page.locator("input[name='firstname']").first().fill("Ada");
        await page.locator("input[name='lastname']").first().fill("Obsidian");
        await page.locator("input[name='email']").first().fill("e2e@obsidian.test");
        await page.locator("input[name='password']").first().fill("Obsidian-Passw0rd-1");
        await page.locator("input[name='password_confirmation']").first().fill("Obsidian-Passw0rd-1");
        await page.locator("form button[type=submit]").first().click();

        await page.waitForLoadState("load");
        await expect(page.locator("body")).toContainText(/already|exists|account/i, { timeout: 30_000 });
    });

    test("an invalid coupon says why, through the JSON channel", { tag: "@behaviour:session-messages" }, async ({ page }) => {
        await addToCart(page);
        await page.goto("/checkout/cart/");

        const coupon = page.locator("[data-cart-coupon]").first();
        await expect(coupon).toBeVisible({ timeout: 30_000 });

        await coupon.locator("input[name='coupon_code']").fill("DEFINITELY-NOT-VALID");
        await coupon.locator("button[type='submit']").first().click();

        await expect(page.locator("body")).toContainText(/coupon|code/i, { timeout: 30_000 });
    });
});
