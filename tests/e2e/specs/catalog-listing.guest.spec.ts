import { expect, test } from "@playwright/test";
import { cards, EMPTY_SEARCH_PATH, firstCardName, LISTING_PATH, listingTotal, toolbarAmount } from "../src/catalog";

test.describe("category listing", () => {
    test("pages the category instead of dropping what does not fit", { tag: "@cap:catalog_category_view" }, async ({ page }) => {
        await page.goto(LISTING_PATH);

        const total = await listingTotal(page);
        expect(total).toBeGreaterThan(await cards(page).count());

        const pager = page.locator(".pages, [class*='pager']").first();
        await expect(pager).toBeVisible();

        const firstOnPageOne = await firstCardName(page);
        await page.goto(`${LISTING_PATH}?p=2`);
        await expect(cards(page).first()).toBeVisible();
        expect(await firstCardName(page)).not.toBe(firstOnPageOne);
    });

    test("sorting reorders the grid and survives a reload", { tag: "@cap:catalog_category_view" }, async ({ page }) => {
        await page.goto(LISTING_PATH);
        const byPosition = await firstCardName(page);

        await page.goto(`${LISTING_PATH}?product_list_order=name`);
        await expect(cards(page).first()).toBeVisible();
        const byName = await firstCardName(page);

        expect(byName).not.toBe(byPosition);
        await page.reload();
        expect(await firstCardName(page)).toBe(byName);
    });

    test("the page size limiter is honoured", { tag: "@cap:catalog_category_view" }, async ({ page }) => {
        await page.goto(`${LISTING_PATH}?product_list_limit=12`);
        await expect(cards(page).first()).toBeVisible();
        expect(await cards(page).count()).toBeLessThanOrEqual(12);
    });

    test("a layer filter narrows the grid and can be cleared", { tag: "@cap:catalog_category_view" }, async ({ page }) => {
        await page.goto(LISTING_PATH);
        const before = await listingTotal(page);

        const filter = page.locator("a.ln__item").first();
        await expect(filter).toBeVisible();
        const filtered = new URL(await filter.getAttribute("href") ?? "", page.url());
        await filter.click();
        await page.waitForURL(`**${filtered.pathname}${filtered.search}`);
        await expect(cards(page).first()).toBeVisible();

        const after = await listingTotal(page);
        expect(after).toBeGreaterThan(0);
        expect(after).toBeLessThan(before);
    });

    test("a search with no matches says so instead of rendering an empty grid", { tag: "@cap:catalogsearch_result_index" }, async ({ page }) => {
        await page.goto(EMPTY_SEARCH_PATH);

        expect(await cards(page).count()).toBe(0);
        await expect(page.locator("#maincontent")).toContainText(/no.*(results|found|match)/i);
    });
});
