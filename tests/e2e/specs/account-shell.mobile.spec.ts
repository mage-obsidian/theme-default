import { expect, test } from "@playwright/test";
import { accountRoutes } from "../src/routes";
import { expectAccountShell, rail, railLink } from "../src/account";

test.describe("account on a phone", () => {
    test("the rail lies down into a scrolling strip", { tag: "@cap:customer_account" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);
        await expectAccountShell(page, /^Hello, /, "Account Dashboard");

        const list = rail(page).locator(".account-rail__list");
        const layout = await list.evaluate((element) => {
            const style = getComputedStyle(element);
            return { overflowX: style.overflowX, snap: style.scrollSnapType, direction: style.flexDirection };
        });

        expect(layout.overflowX).toBe("auto");
        expect(layout.snap).toContain("x");
    });

    test("there is still one nav and one heading, not a second set for mobile", { tag: "@cap:customer_account" }, async ({ page }) => {
        await page.goto(accountRoutes.orders.path);

        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.getByRole("navigation", { name: "Account" })).toHaveCount(1);
    });

    test("the current entry is brought into view", { tag: "@cap:customer_account" }, async ({ page }) => {
        // Newsletter sits far enough down the list to be off-screen on a phone.
        await page.goto(accountRoutes.newsletter.path);

        const current = railLink(page, "Newsletter Subscriptions");
        await expect(current).toHaveAttribute("aria-current", "page");
        await expect(current).toBeInViewport();
    });

    test("nothing overflows the viewport sideways", { tag: "@cap:customer_account" }, async ({ page }) => {
        for (const route of [accountRoutes.dashboard, accountRoutes.orders, accountRoutes.wishlist]) {
            await page.goto(route.path);
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            expect(overflow, `${route.path} scrolls sideways`).toBeLessThanOrEqual(1);
        }
    });
});
