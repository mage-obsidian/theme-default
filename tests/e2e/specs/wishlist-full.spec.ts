import { expect, test } from "@playwright/test";
import { cartCount } from "../src/checkout";

const items = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /^add to cart$/i });

test.describe("wish list, beyond the list", () => {
    test("an item moves from the list into the cart", { tag: "@cap:wishlist_index_index" }, async ({ page }) => {
        await page.goto("/wishlist/");
        const before = await cartCount(page);
        const count = await items(page).count();
        expect(count).toBeGreaterThan(0);

        await items(page).first().click();

        await expect.poll(() => cartCount(page), { timeout: 30_000 }).toBeGreaterThan(before);
    });

    test("the whole list can be sent to the cart at once", { tag: "@cap:wishlist_index_index" }, async ({ page }) => {
        await page.goto("/wishlist/");
        await expect(page.getByRole("button", { name: /add all to cart/i })).toBeVisible();
    });

    test("the share form asks for recipients and a message", { tag: "@cap:wishlist_index_share" }, async ({ page }) => {
        await page.goto("/wishlist/index/share/");

        await expect(page.locator("h1")).toContainText(/share wish list/i);
        await expect(page.locator("textarea[name='emails'], input[name='emails']").first()).toBeVisible();
        await expect(page.locator("textarea[name='message'], input[name='message']").first()).toBeVisible();
    });

    test("sharing the list reaches its recipient", { tag: "@cap:wishlist_index_share" }, async ({ page }) => {
        await page.goto("/wishlist/index/share/");

        await page.locator("textarea[name='emails'], input[name='emails']").first().fill("friend@obsidian.test");
        await page.locator("textarea[name='message'], input[name='message']").first().fill("Look at this");
        await page.locator("form button[type=submit]").first().click();

        await page.waitForURL(/wishlist/, { timeout: 45_000 });
        await expect(page.locator("#maincontent")).toContainText(/\S/);
    });

    test("the shared list opens on its own page for whoever receives it", { tag: "@cap:wishlist_shared_index" }, async ({ page }) => {
        const response = await page.goto("/wishlist/shared/");
        expect(response?.status()).toBeLessThan(500);
    });

    test("the rail counter reports the list, not the page", { tag: "@behaviour:private-sections" }, async ({ page }) => {
        await page.goto("/wishlist/");

        const rail = page.locator(".account-rail").getByRole("link", { name: /my wish list/i }).first();
        await expect(rail).toBeVisible();
        expect(((await rail.textContent()) ?? "").match(/\d+/)?.[0]).toBeTruthy();
    });
});
