import { expect, test, type Page } from "@playwright/test";

const SIMPLE = "/fusion-backpack.html";
const CONFIGURABLE = "/chaz-kangeroo-hoodie.html";

const main = (page: Page) => page.locator("[data-gallery-main]");

/**
 * Resolve a variant by taking the first option of every attribute group. One
 * attribute is not a variant — the image only moves once all of them are chosen —
 * and picking by group keeps this independent of the fixture's option labels.
 */
async function chooseEveryOption(page: Page): Promise<void> {
    const groups = page.locator(".pdp__swatch-group");
    for (let i = 0; i < (await groups.count()); i++) {
        await groups.nth(i).locator(".pdp__swatch:not(.pdp__swatch--unavailable)").first().click();
    }
}

const thumbs = (page: Page) => page.locator("[data-gallery-thumb]");

const fileOf = async (page: Page): Promise<string> =>
    ((await main(page).getAttribute("src")) ?? "").split("/").pop() ?? "";

test.describe("product gallery", () => {
    test("the hero is server-rendered and eager, so it can be the LCP", async ({ page }) => {
        await page.goto(SIMPLE);

        await expect(main(page)).toHaveAttribute("fetchpriority", "high");
        await expect(main(page)).not.toHaveAttribute("loading", "lazy");
        expect(await fileOf(page)).not.toBe("");
    });

    test("a thumb swaps the hero and takes the pressed state with it", async ({ page }) => {
        await page.goto(SIMPLE);
        const before = await fileOf(page);

        await thumbs(page).nth(1).click();
        await expect
            .poll(async () => await fileOf(page), { timeout: 5000 })
            .not.toBe(before);

        await expect(thumbs(page).nth(1)).toHaveAttribute("aria-pressed", "true");
        await expect(thumbs(page).nth(0)).toHaveAttribute("aria-pressed", "false");
    });

    test("arrow keys move along the strip", async ({ page }) => {
        await page.goto(SIMPLE);
        await thumbs(page).first().focus();

        await page.keyboard.press("ArrowRight");

        await expect(thumbs(page).nth(1)).toBeFocused();
        await expect(thumbs(page).nth(1)).toHaveAttribute("aria-pressed", "true");
    });

    test("resolving a variant swaps the hero and rebuilds the strip", async ({ page }) => {
        await page.goto(CONFIGURABLE);
        const before = await fileOf(page);
        await chooseEveryOption(page);

        await expect
            .poll(async () => await fileOf(page), { timeout: 8000 })
            .not.toBe(before);
        await expect(thumbs(page).first()).toHaveAttribute("aria-pressed", "true");
    });

    test("a rebuilt thumb keeps the classes the template gave it", async ({ page }) => {
        await page.goto(CONFIGURABLE);
        const served = (await thumbs(page).first().getAttribute("class")) ?? "";
        expect(served).toContain("pdp__thumb");

        await chooseEveryOption(page);
        await expect.poll(async () => await thumbs(page).count(), { timeout: 8000 }).toBeGreaterThan(0);

        // The strip is cloned from the server's own markup, so a class chain added
        // in gallery.twig cannot drift away from what the enhancer rebuilds.
        expect(await thumbs(page).first().getAttribute("class")).toBe(served);
    });
});
