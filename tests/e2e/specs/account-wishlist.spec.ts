import { expect, test } from "@playwright/test";
import { accountRoutes } from "../src/routes";
import { expectAccountShell, railCount } from "../src/account";

test.describe("wish list", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(accountRoutes.wishlist.path);
    });

    test("shows the saved products as cards with their actions", async ({ page }) => {
        await expectAccountShell(page, "My Wish List", "My Wish List");

        const cards = page.locator("li.product-card");
        expect(await cards.count()).toBeGreaterThan(0);

        const first = cards.first();
        await expect(first.locator(".product-card__media img")).toBeVisible();
        await expect(first.locator(".product-card__name a")).toBeVisible();
        await expect(first.locator(".product-card__price")).not.toBeEmpty();
        await expect(first.getByRole("button", { name: "Remove" })).toBeVisible();

        await expect(page.getByRole("link", { name: "Share Wish List" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Add All to Cart" })).toBeVisible();
    });

    test("pages past ten instead of hiding the rest", async ({ page }) => {
        // The pager core builds in _prepareLayout is what page-sizes the collection;
        // leaving it unrendered hid everything after the tenth saved product.
        await expect(page.locator("li.product-card")).toHaveCount(10);

        const amount = page.locator(".pager .toolbar-amount");
        await expect(amount).toContainText("Items 1 to 10 of");

        await page.locator(".pages-items").getByRole("link", { name: /^Page\s*2$/ }).click();
        await expect(page.locator(".pager .toolbar-amount")).toContainText("Items 11 to");
    });

    test("the rail counter matches the real total, not the page", async ({ page }) => {
        // It once read the already page-sized collection and said ten next to eleven.
        const counter = await railCount(page, "My Wish List");
        expect(counter).not.toBeNull();

        const amount = (await page.locator(".pager .toolbar-amount").textContent()) ?? "";
        const total = Number(amount.match(/of\s+([\d.,]+)/)?.[1]?.replace(/\D/g, "") ?? 0);

        expect(counter).toBe(total);
        expect(total).toBeGreaterThan(10);
    });

    test("removing asks first and cancelling keeps the product", async ({ page }) => {
        const before = await page.locator("li.product-card").count();
        const card = page.locator("li.product-card").first();
        const name = await card.locator(".product-card__name").innerText();

        await card.getByRole("button", { name: "Remove" }).click();
        const dialog = page.locator("dialog.confirm-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(".confirm-dialog__title")).toHaveText("Remove from your wish list?");
        await expect(dialog.locator(".confirm-dialog__body")).toContainText(name.trim());

        await dialog.getByRole("button", { name: "Keep it" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator("li.product-card")).toHaveCount(before);
    });

    test("item actions are native POSTs, so they work without JS", async ({ page }) => {
        const remove = page.locator("form[data-confirm-title]").first();
        await expect(remove).toHaveAttribute("method", "post");
        await expect(remove).toHaveAttribute("action", /wishlist\/index\/remove/);
        await expect(remove.locator('input[name="form_key"]')).toHaveCount(1);
        await expect(remove.locator('input[name="item"]')).toHaveCount(1);

        const addAll = page.locator("form", { has: page.getByRole("button", { name: "Add All to Cart" }) });
        await expect(addAll).toHaveAttribute("action", /wishlist\/index\/allcart/);
        await expect(addAll.locator('input[name="form_key"]')).toHaveCount(1);
    });
});
