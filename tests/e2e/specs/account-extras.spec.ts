import { expect, test } from "@playwright/test";
import { accountRoutes } from "../src/routes";
import { expectAccountShell, isRouteLive } from "../src/account";

/**
 * Downloadables and stored cards. Both modules ship with the redesign but neither
 * is wired in every environment, so each test proves the route is live before it
 * asserts anything — an unwired module skips instead of reporting a false defect.
 */
test.describe("downloadable products", () => {
    test("renders inside the shell, with a table or an empty state", { tag: "@cap:downloadable_customer_products" }, async ({ page }) => {
        test.skip(!(await isRouteLive(page, accountRoutes.downloadables.path)), "module not wired here");

        await expectAccountShell(page, "My Downloadable Products", "My Downloadable Products");

        const purchases = page.locator(".account-panel__title", { hasText: "Purchases" });
        const empty = page.locator(".empty-state");
        expect((await purchases.count()) + (await empty.count())).toBeGreaterThan(0);
    });
});

test.describe("stored payment methods", () => {
    test("renders inside the shell, with cards or an empty state", { tag: "@cap:vault_cards_listaction" }, async ({ page }) => {
        test.skip(!(await isRouteLive(page, accountRoutes.vault.path)), "module not wired here");

        await expectAccountShell(page, "Stored Payment Methods", "Stored Payment Methods");

        const cards = page.locator(".account-panel");
        const empty = page.locator(".empty-state");
        expect((await cards.count()) + (await empty.count())).toBeGreaterThan(0);
    });
});
