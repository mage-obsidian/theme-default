import { expect, test } from "@playwright/test";
import { customer } from "../src/env";
import { accountRoutes } from "../src/routes";
import { expectAccountShell, isRouteLive, rail, railLink } from "../src/account";

/**
 * The frame around all sixteen account pages. Everything here used to be copied
 * template by template, which is exactly why it drifted; these checks are the
 * reason it cannot drift again.
 */
test.describe("account shell", () => {
    for (const [name, route] of Object.entries(accountRoutes)) {
        test(`${name} renders the rail, one heading and its own entry marked`, { tag: `@cap:${route.capability}` }, async ({ page }) => {
            if (route.optional && !(await isRouteLive(page, route.path))) {
                test.skip(true, `${route.path} is not wired in this environment`);
            }

            await page.goto(route.path);
            await expectAccountShell(page, route.heading, route.navLabel);
        });
    }

    test("the rail identifies the signed-in customer", { tag: "@behaviour:private-sections" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);

        await expect(rail(page).locator(".account-rail__name")).toHaveText(
            `${customer.firstName} ${customer.lastName}`,
        );
        await expect(rail(page).locator(".account-rail__email")).toHaveText(customer.email);
        await expect(rail(page).locator(".account-rail__monogram")).toHaveText("AO");
    });

    test("every rail entry carries an icon and the way out sits last", { tag: "@cap:customer_account" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);

        const links = rail(page).locator(".account-rail__link");
        const total = await links.count();
        expect(total).toBeGreaterThan(5);

        for (let index = 0; index < total; index++) {
            await expect(links.nth(index).locator("svg")).toHaveCount(1);
        }

        await expect(links.last()).toHaveText(/Sign Out/);
        await expect(rail(page).locator(".account-rail__out")).toHaveCount(1);
    });

    test("counters report what the pages actually hold", { tag: "@behaviour:private-sections" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);

        const orders = rail(page).locator('a:has-text("My Orders") .account-rail__count');
        const wishlist = rail(page).locator('a:has-text("My Wish List") .account-rail__count');

        // Both were wrong at some point: the wishlist counter read a page-sized
        // collection and reported ten next to eleven saved products.
        await expect(orders).toHaveText(/^\d+$/);
        await expect(wishlist).toHaveText(/^\d+$/);

        const wished = Number(await wishlist.textContent());
        await page.goto(accountRoutes.wishlist.path);
        const total = (await page.locator(".pager .toolbar-amount").textContent()) ?? "";
        expect(total).toContain(String(wished));
    });

    test("tabbing reaches the rail and the ring is visible on obsidian", { tag: "@cap:customer_account" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);
        await page.locator("body").click({ position: { x: 2, y: 2 } });

        // Walk in with the keyboard rather than focusing directly: :focus-visible
        // is what draws the ring, and it only answers to a real keyboard.
        let reached = false;
        for (let step = 0; step < 60 && !reached; step++) {
            await page.keyboard.press("Tab");
            reached = await page.evaluate(
                () => !!document.activeElement?.classList.contains("account-rail__link"),
            );
        }
        expect(reached, "no rail link is reachable by keyboard").toBe(true);

        const ring = await page.evaluate(() => {
            const style = getComputedStyle(document.activeElement as Element);
            return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
        });
        expect(ring.style).not.toBe("none");
        expect(ring.width).toBeGreaterThanOrEqual(2);
    });
});
