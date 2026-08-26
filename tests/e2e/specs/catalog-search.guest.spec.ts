import { expect, test } from "@playwright/test";
import { cards, listingTotal, SEARCH_PATH, SEARCH_TERM } from "../src/catalog";

test.describe("catalogue search", () => {
    test("a term returns matching products and says how many", { tag: "@cap:catalogsearch_result_index" }, async ({ page }) => {
        await page.goto(SEARCH_PATH);

        await expect(cards(page).first()).toBeVisible();
        expect(await listingTotal(page)).toBeGreaterThan(0);
        await expect(page.locator("h1").last()).toContainText(new RegExp(SEARCH_TERM, "i"));
    });

    test("the results page pages and sorts like a category does", { tag: "@cap:catalogsearch_result_index" }, async ({ page }) => {
        await page.goto(SEARCH_PATH);
        const total = await listingTotal(page);
        expect(total).toBeGreaterThan(await cards(page).count());

        const firstByRelevance = (await cards(page).first().locator(".product-card__name").textContent())?.trim();
        await page.goto(`${SEARCH_PATH}&product_list_order=name`);
        await expect(cards(page).first()).toBeVisible();
        expect((await cards(page).first().locator(".product-card__name").textContent())?.trim()).not.toBe(firstByRelevance);
    });

    test("the header search reaches the results page", { tag: "@cap:catalogsearch_result_index" }, async ({ page }) => {
        await page.goto("/");

        await page.getByRole("button", { name: /^search$/i }).first().click();

        const field = page.getByRole("combobox", { name: /search/i }).first();
        await expect(field).toBeVisible();
        await field.fill(SEARCH_TERM);
        await field.press("Enter");

        await page.waitForURL(/catalogsearch\/result/);
        await expect(cards(page).first()).toBeVisible();
    });

    test("advanced search renders its form and runs a query", { tag: "@cap:catalogsearch_advanced_index" }, async ({ page }) => {
        const response = await page.goto("/catalogsearch/advanced/");
        test.skip(response?.status() === 404, "advanced search is not routed in this environment");

        await expect(page.locator("h1").last()).toContainText(/advanced search/i);
        const name = page.locator("input[name='name']").first();
        await expect(name).toBeVisible();
        await name.fill(SEARCH_TERM);
        await page.locator("button[type='submit']").first().click();

        await page.waitForURL(/catalogsearch\/advanced\/result/);
        await expect(page.locator("#maincontent")).toBeVisible();
    });
});
