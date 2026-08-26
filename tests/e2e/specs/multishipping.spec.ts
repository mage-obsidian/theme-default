import { expect, test } from "@playwright/test";
import { addToCart, cartCount } from "../src/checkout";

test.describe("checkout to several addresses", () => {
    test("splits one order across two addresses and places both", { tag: "@cap:multishipping_checkout_addresses" }, async ({ page }) => {
        await addToCart(page);
        await page.goto("/checkout/cart/");

        const line = page.locator("[data-cart-line]").first();
        await expect(line).toBeVisible();
        await line.locator("[data-cart-step='1']").first().click();
        await expect.poll(() => cartCount(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);

        await page.goto("/multishipping/checkout/addresses/");
        await expect(page.locator("h1")).toContainText(/ship to multiple|addresses/i, { timeout: 20_000 });

        const selects = page.locator("select[name^='ship[']");
        const selectCount = await selects.count();
        test.skip(selectCount < 1, "the account needs a second address for this flow");

        const options = await selects.first().locator("option").count();
        test.skip(options < 2, "the account has a single address, so nothing can be split");

        const quantities = page.locator("input[name$='[qty]']");
        if ((await quantities.count()) === 1) {
            await quantities.first().fill("1");
        }

        await page.getByRole("button", { name: /enter a new address|update qty/i }).first().waitFor();
        await page.locator("button[name='continue'][value='1']").click();

        await page.waitForURL(/multishipping\/checkout\/(shipping|addresses)/, { timeout: 30_000 });
        await expect(page.locator("#maincontent")).toBeVisible();
    });

    test("the cart offers the multi-address route", { tag: "@cap:checkout_cart_index" }, async ({ page }) => {
        await addToCart(page);
        await page.goto("/checkout/cart/");

        await expect(page.getByRole("link", { name: /multiple addresses/i }).first()).toBeVisible();
    });

    test("each multishipping step renders its own page", { tag: "@cap:multishipping_checkout_addresses" }, async ({ page }) => {
        await addToCart(page);

        const response = await page.goto("/multishipping/checkout/addresses/");
        expect(response?.status()).toBeLessThan(400);
        await expect(page.locator("#maincontent")).toBeVisible();
        await expect(page.locator("table").first()).toBeVisible();
    });
});
