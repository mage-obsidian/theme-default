import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export type ProductFixture = { sku: string; urlKey: string; id: number };

export type CatalogFixture = {
    products: Record<string, ProductFixture | null>;
};

export const LISTING_PATH = "/collections/yoga-new.html";
export const SEARCH_TERM = "yoga";
export const SEARCH_PATH = `/catalogsearch/result/?q=${SEARCH_TERM}`;
export const EMPTY_SEARCH_PATH = "/catalogsearch/result/?q=zzzqqqxxnothingmatchesthis";

export const catalogFixture = (): CatalogFixture | null => {
    try {
        return JSON.parse(readFileSync(join(import.meta.dirname, "../.artifacts/fixture.json"), "utf8"));
    } catch {
        return null;
    }
};

export const productPath = (product: ProductFixture): string => `/${product.urlKey}.html`;

export const cards = (page: Page) => page.locator(".product-card");

export const toolbarAmount = (page: Page) => page.locator("#toolbar-amount");

export const firstCardName = async (page: Page): Promise<string> =>
    ((await cards(page).first().locator(".product-card__name").textContent()) ?? "").trim();

export const listingTotal = async (page: Page): Promise<number> => {
    const summary = ((await toolbarAmount(page).textContent()) ?? "").trim();
    const ranged = summary.match(/of\s+(\d+)/i);
    if (ranged) {
        return Number(ranged[1]);
    }
    const counted = summary.match(/(\d+)\s+Items?/i);
    return counted ? Number(counted[1]) : 0;
};
