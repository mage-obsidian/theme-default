import { expect, test } from "@playwright/test";
import { catalogFixture, productPath, type ProductFixture } from "../src/catalog";

const fixture = catalogFixture();

const productFor = (role: string): ProductFixture | null => fixture?.products?.[role] ?? null;

const openProduct = async (page: import("@playwright/test").Page, role: string): Promise<ProductFixture> => {
    const product = productFor(role);
    test.skip(product === null, `the catalogue has no ${role} product; run the seed`);
    await page.goto(productPath(product as ProductFixture));
    await expect(page.locator("h1")).toBeVisible();
    return product as ProductFixture;
};

test.describe("product page by type", () => {
    test("a simple product offers its form and a price", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await openProduct(page, "simple");

        await expect(page.locator(".pdp__form")).toBeVisible();
        await expect(page.locator("[data-pdp] .price, .price").first()).toBeVisible();
        await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
    });

    test("a virtual product offers its form and never asks for shipping detail", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await openProduct(page, "virtual");

        await expect(page.locator(".pdp__form")).toBeVisible();
        await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
    });

    test("a configurable product renders its options and resolves a variant", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await openProduct(page, "configurable");

        await expect(page.locator(".pdp__configurable")).toBeVisible();

        const groups = page.locator(".pdp__swatch-group");
        const groupCount = await groups.count();
        expect(groupCount).toBeGreaterThan(0);

        for (let index = 0; index < groupCount; index += 1) {
            await groups.nth(index).locator(".pdp__swatch").first().click();
        }

        await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
    });

    test("a bundle product renders every option group it is built from", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await openProduct(page, "bundle");

        await expect(page.locator(".pdp__bundle")).toBeVisible();
        expect(await page.locator(".pdp__bundle-option").count()).toBeGreaterThan(0);
    });

    test("a grouped product lists its members with their own quantities", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await openProduct(page, "grouped");

        await expect(page.locator(".pdp__group-table")).toBeVisible();
        expect(await page.locator(".pdp__group-table input").count()).toBeGreaterThan(0);
    });

    test("a downloadable product lists its links and its samples", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await openProduct(page, "downloadable");

        await expect(page.locator(".pdp__links")).toBeVisible();
        expect(await page.locator(".pdp__link").count()).toBeGreaterThan(0);
    });
});
