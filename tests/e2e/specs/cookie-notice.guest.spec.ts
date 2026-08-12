import { expect, test } from "@playwright/test";

/**
 * The consent banner is on every page a first-time visitor sees, so a link
 * inside it is one of the most crawled on the storefront. Lighthouse scores
 * "Learn more" as a link without descriptive text; this keeps the name
 * standing on its own, read out of context.
 */

const GENERIC = [/^learn more$/i, /^read more$/i, /^click here$/i, /^more$/i, /^here$/i, /^this$/i];

test.describe("cookie consent banner", () => {
    test("the policy link says where it goes", async ({ page }) => {
        await page.goto("/");

        const banner = page.locator("#notice-cookie-block");
        await expect(banner).toBeVisible();

        const link = banner.getByRole("link").first();
        await expect(link).toHaveAttribute("href", /privacy/i);

        const name = ((await link.textContent()) ?? "").trim();
        expect(name.length, `the link has no accessible name`).toBeGreaterThan(0);
        for (const pattern of GENERIC) {
            expect(name, `"${name}" is generic link text`).not.toMatch(pattern);
        }
    });

    test("accepting closes it and it stays closed", async ({ page }) => {
        await page.goto("/");

        const banner = page.locator("#notice-cookie-block");
        await expect(banner).toBeVisible();

        await banner.getByRole("button").click();
        await expect(banner).toBeHidden();

        await page.goto("/gear/bags.html");
        await expect(page.locator("#notice-cookie-block")).toBeHidden();
    });
});
