import { expect, test } from "@playwright/test";
import { customer } from "../src/env";
import { accountRoutes } from "../src/routes";

test.describe("dashboard", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);
    });

    test("greets the customer and lays the metrics out as a spec sheet", { tag: "@cap:customer_account_index" }, async ({ page }) => {
        await expect(page.locator("h1")).toHaveText(`Hello, ${customer.firstName}`);

        const stats = page.locator(".account-stats .account-stat");
        expect(await stats.count()).toBeGreaterThanOrEqual(3);

        for (const value of await page.locator(".account-stat__value").allInnerTexts()) {
            expect(value.trim()).not.toBe("");
        }

        // The tiles are the rail counters, so a counted module gets one for free.
        await expect(page.locator(".account-stats")).toContainText("Addresses");
    });

    test("shows the last order with its thumbnails and status", { tag: "@cap:customer_account_index" }, async ({ page }) => {
        const recent = page.locator(".account-panel", { hasText: "Order" }).first();
        await expect(recent).toBeVisible();
        await expect(page.locator(".order-thumbs").first()).toBeVisible();
        await expect(page.locator(".chip").first()).toBeVisible();
    });

    test("carries contact details, default addresses and the shortcuts", { tag: "@cap:customer_account_index" }, async ({ page }) => {
        const contact = page.locator(".account-panel", { hasText: "Contact Information" });
        await expect(contact).toContainText(customer.email);
        await expect(contact.getByRole("link", { name: "Edit" })).toBeVisible();
        await expect(contact.getByRole("link", { name: "Change Password" })).toBeVisible();

        const addresses = page.locator(".account-panel", { hasText: "Default Addresses" });
        await expect(addresses).toContainText("Billing");
        await expect(addresses).toContainText("Shipping");
        await expect(addresses.getByRole("link", { name: "Manage" })).toBeVisible();

        const shortcuts = page.locator(".account-panel", { hasText: "Shortcuts" });
        for (const label of ["Add an Address", "Account Information", "Newsletter", "Wish List"]) {
            await expect(shortcuts.getByRole("link", { name: label })).toBeVisible();
        }
    });

    test("every panel heading is an h2, so the outline stays flat under the h1", { tag: "@cap:customer_account_index" }, async ({ page }) => {
        const titles = page.locator(".account-panel__title");
        expect(await titles.count()).toBeGreaterThan(0);

        for (const tag of await titles.evaluateAll((nodes) => nodes.map((node) => node.tagName))) {
            expect(tag).toBe("H2");
        }
    });
});
