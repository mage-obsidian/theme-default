import { expect, test } from "@playwright/test";
import { catalogFixture, LISTING_PATH, productPath, type ProductFixture } from "../src/catalog";

const blocks = async (page: import("@playwright/test").Page): Promise<unknown[]> =>
    page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
        nodes.map((node) => {
            try {
                return JSON.parse(node.textContent ?? "");
            } catch {
                return { __invalid: node.textContent?.slice(0, 80) };
            }
        }),
    );

const typesIn = (parsed: unknown[]): string[] =>
    parsed.flatMap((entry) => {
        const graph = (entry as { "@graph"?: unknown[] })["@graph"];
        const nodes = Array.isArray(graph) ? graph : [entry];
        return nodes.map((node) => String((node as { "@type"?: unknown })["@type"] ?? ""));
    });

test.describe("structured data", () => {
    test("the home page declares the organisation and the site", { tag: "@behaviour:structured-data" }, async ({ page }) => {
        await page.goto("/");

        const parsed = await blocks(page);
        expect(parsed.length, "the home page must emit structured data").toBeGreaterThan(0);
        expect(parsed.some((entry) => "__invalid" in (entry as object)), "every block must be valid JSON").toBe(false);
        expect(typesIn(parsed).join(" ")).toMatch(/Organization|WebSite/);
    });

    test("a category page declares its breadcrumb trail", { tag: "@behaviour:structured-data" }, async ({ page }) => {
        await page.goto(LISTING_PATH);

        const parsed = await blocks(page);
        expect(parsed.some((entry) => "__invalid" in (entry as object))).toBe(false);
        expect(typesIn(parsed).join(" ")).toMatch(/BreadcrumbList|WebSite|Organization/);
    });

    test("a product page declares the product", { tag: "@behaviour:structured-data" }, async ({ page }) => {
        const product = catalogFixture()?.products?.simple as ProductFixture | null;
        test.skip(product === null || product === undefined, "run the seed first");

        await page.goto(productPath(product as ProductFixture));

        const parsed = await blocks(page);
        expect(parsed.some((entry) => "__invalid" in (entry as object))).toBe(false);
        expect(typesIn(parsed).join(" "), "a product page must describe its product").toMatch(/Product/);
    });
});
