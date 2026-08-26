import { expect, test } from "@playwright/test";
import { readFixture } from "../src/env";
import { GUEST_PAGES } from "../src/perf/pages";

const HOSTILE = '</script><img src=x data-xss-probe onerror="window.__xssFired = true">';

declare global {
    interface Window {
        __xssFired?: boolean;
    }
}

interface Block {
    where: string;
    text: string;
}

const embeddedBlocks = (page: import("@playwright/test").Page): Promise<Block[]> =>
    page.evaluate(() => {
        const blocks: { where: string; text: string }[] = [];
        for (const node of document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]')) {
            blocks.push({ where: `${node.getAttribute("type")} ${node.getAttribute("data-options-config") !== null ? "options" : ""}`.trim(), text: node.textContent ?? "" });
        }
        for (const node of document.querySelectorAll("[data-props]")) {
            blocks.push({ where: `data-props on ${node.getAttribute("data-component") ?? node.tagName.toLowerCase()}`, text: node.getAttribute("data-props") ?? "" });
        }
        return blocks;
    });

const nothingEscaped = async (page: import("@playwright/test").Page, where: string): Promise<void> => {
    await expect(page.locator("[data-xss-probe]"), `${where} let a planted element into the document`).toHaveCount(0);
    expect(await page.evaluate(() => window.__xssFired === true), `${where} executed a planted handler`).toBe(false);
};

test.describe("what the server embeds in the page stays data", () => {
    for (const definition of GUEST_PAGES) {
        test(`${definition.name} embeds only blocks that parse as JSON`, { tag: `@cap:${definition.capability}` }, async ({ page }) => {
            if (definition.prepare) {
                await definition.prepare(page);
            }
            await page.goto(definition.path, { waitUntil: "load" });

            const blocks = await embeddedBlocks(page);
            expect(blocks.length, `${definition.name} embeds no data block at all — the probe or the page is wrong`).toBeGreaterThan(0);

            const broken = blocks.filter((block) => {
                try {
                    JSON.parse(block.text);
                    return false;
                } catch {
                    return true;
                }
            });
            expect(broken.map((block) => `${block.where}: ${block.text.slice(0, 120)}`)).toEqual([]);
            await nothingEscaped(page, definition.name);
        });
    }

    test("a search term that tries to close a script block is carried as text", { tag: "@cap:catalogsearch_result_index" }, async ({ page }) => {
        await page.goto(`/catalogsearch/result/?q=${encodeURIComponent(HOSTILE)}`, { waitUntil: "load" });

        await nothingEscaped(page, "the search page");
        await expect(page.locator("h1")).toContainText("script", { ignoreCase: true });

        const blocks = await embeddedBlocks(page);
        for (const block of blocks) {
            expect(() => JSON.parse(block.text), `${block.where} stopped being JSON once the term reached it`).not.toThrow();
        }
    });

    test("a search term with an ampersand comes back the way the shopper typed it", { tag: "@cap:catalogsearch_result_index" }, async ({ page }) => {
        test.fixme(
            true,
            "MageObsidian\\Storefront\\ViewModel\\SearchForm::getQueryValue returns Magento\\Search\\Helper\\Data::getEscapedQueryText, which is already HTML-escaped; the search input escapes it a second time and the shopper sees Ben &amp; Jerry in the box — see registry entry security/magento-search/double-escaped-query",
        );
        await page.goto("/catalogsearch/result/?q=Ben+%26+Jerry", { waitUntil: "load" });

        await expect(page.locator("#header-search")).toHaveValue("Ben & Jerry");
    });

    test("a review whose title opens a comment and a script does not reopen the tokenizer", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        const fixture = readFixture();
        test.skip(fixture?.hostileReviewUrl == null, "no tokenizer probe in the fixture — run `pnpm seed` first");

        await page.goto(fixture!.hostileReviewUrl!, { waitUntil: "load" });

        await nothingEscaped(page, "the product page carrying the probe review");
        const stray = await page.evaluate(() =>
            [...document.querySelectorAll("script")].filter((node) => node.textContent?.includes("data-xss-probe")).length,
        );
        expect(stray, "a script element grew out of the review title").toBe(0);

        for (const block of await embeddedBlocks(page)) {
            expect(() => JSON.parse(block.text), `${block.where} stopped being JSON once the review reached it`).not.toThrow();
        }
    });
});
