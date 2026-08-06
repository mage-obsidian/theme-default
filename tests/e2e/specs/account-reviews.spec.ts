import { expect, test } from "@playwright/test";
import { accountRoutes } from "../src/routes";
import { expectAccountShell } from "../src/account";

test.describe("my reviews", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(accountRoutes.reviews.path);
    });

    test("lists every review, not the first ten", async ({ page }) => {
        await expectAccountShell(page, "My Product Reviews", "My Product Reviews");

        const reviews = page.locator("ol > li .account-panel");
        expect(await reviews.count()).toBeGreaterThan(0);

        // Core caps this list through a pager it never renders, and the EAV
        // collection does not survive an offset — page two came back empty. The
        // block drops the cap instead, so there is deliberately no pager here.
        await expect(page.locator(".pager")).toHaveCount(0);
    });

    test("each entry carries the product, the stars and the date", async ({ page }) => {
        const first = page.locator("ol > li .account-panel").first();

        await expect(first.getByRole("link").first()).toBeVisible();
        // The stars are glyphs behind an aria-label, not an icon.
        await expect(first.getByRole("img", { name: /out of 5 stars/ })).toBeVisible();
        await expect(first.getByRole("link", { name: "See Details" })).toBeVisible();
    });

    test("opening one shows what was written and the rating", async ({ page }) => {
        await page.locator("ol > li .account-panel").first().getByRole("link", { name: "See Details" }).click();
        await page.waitForURL(/review\/customer\/view/, { waitUntil: "domcontentloaded" });

        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator(".account-panel__title", { hasText: "What you wrote" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Back to My Reviews" })).toBeVisible();
        await expect(page.locator(".account-rail")).toBeVisible();
    });
});
