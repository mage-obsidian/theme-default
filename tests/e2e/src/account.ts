import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A form control by its visible label. The field macro puts the required asterisk
 * inside the <label>, and Playwright matches raw label text rather than the
 * accessible name, so an exact match on the label alone never hits.
 */
export const field = (page: Page, label: string): Locator =>
    page.getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\*?$`));

/** The obsidian rail. One <nav> serves desktop and mobile, so there is only ever one. */
export const rail = (page: Page): Locator => page.locator(".account-rail");

/**
 * A rail entry by its label. Counted entries carry the number inside the anchor,
 * so the accessible name reads "My Orders 13" — anchor the match at the label and
 * let whatever counter follows through.
 */
export const railLink = (page: Page, label: string): Locator =>
    rail(page).getByRole("link", {
        name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s+\\d+)?$`),
    });

/**
 * The account contract every page in the area has to honour: one rail, exactly one
 * <h1>, and the rail entry for the current page marked — the three things the
 * redesign made structural rather than copied per template.
 */
export async function expectAccountShell(
    page: Page,
    heading: string | RegExp,
    navLabel?: string,
): Promise<void> {
    await expect(rail(page)).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(heading);

    if (navLabel) {
        await expect(railLink(page, navLabel)).toHaveAttribute("aria-current", "page");
    }
}

/** Rail counters render only when the module supplies one, so this may be null. */
export async function railCount(page: Page, label: string): Promise<number | null> {
    const badge = railLink(page, label).locator(".account-rail__count");
    if (!(await badge.count())) {
        return null;
    }
    return Number((await badge.innerText()).replace(/\D/g, ""));
}

/** True when a route 404s or bounces — used to skip modules an environment lacks. */
export async function isRouteLive(page: Page, path: string): Promise<boolean> {
    const response = await page.goto(path);
    if (!response || !response.ok()) {
        return false;
    }
    return (await page.locator(".account-rail").count()) > 0;
}

/**
 * Scrollable width of the document. Absolutely positioned panels count towards it,
 * which is how an uncapped dropdown used to grow the page.
 */
export const documentScrollHeight = (page: Page): Promise<number> =>
    page.evaluate(() => document.documentElement.scrollHeight);
