import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cacheablePath } from "../src/paint";
import { addToCart } from "../src/checkout";

const fixture = (): { email: string } | null => {
    try {
        return JSON.parse(readFileSync(join(import.meta.dirname, "../.artifacts/fixture.json"), "utf8"));
    } catch {
        return null;
    }
};

const PRIVATE_MARKERS = [
    { label: "the customer's email", value: "e2e@obsidian.test" },
    { label: "a street the customer lives on", value: "144 Obsidian Row" },
    { label: "a second street on the account", value: "9 Alabaster Lane" },
    { label: "the customer's telephone", value: "5125550142" },
];

test.describe("private data never rides in a cacheable response", () => {
    for (const step of cacheablePath) {
        test(`${step.name} carries nothing that belongs to the signed-in customer`, { tag: "@behaviour:private-sections" }, async ({ page }) => {
            const loaded = fixture();
            test.skip(loaded === null, "run the seed first");

            const response = await page.goto(step.path);
            expect(response?.status()).toBeLessThan(400);

            const served = (await response?.text()) ?? "";
            const leaked = PRIVATE_MARKERS.filter((marker) => served.includes(marker.value));

            expect(
                leaked.map((marker) => marker.label),
                `${step.path} is cacheable, so anything private in it would be served to the next visitor`,
            ).toEqual([]);
        });
    }

    test("the checkout page is served from the edge cache, and still carries nothing private", { tag: "@behaviour:private-sections" }, async ({ page }) => {
        const loaded = fixture();
        test.skip(loaded === null, "run the seed first");

        await addToCart(page);
        await page.goto("/checkout/");
        const response = await page.goto("/checkout/");

        const edge = response?.headers()["x-magento-cache-debug"] ?? "";
        expect(
            edge,
            "this deployment does not put the checkout page in the edge cache, so there is nothing to prove here",
        ).toBe("HIT");

        const served = (await response?.text()) ?? "";
        const leaked = PRIVATE_MARKERS.filter((marker) => served.includes(marker.value));
        expect(
            leaked.map((marker) => marker.label),
            "the checkout shell is cacheable on purpose: its private half must arrive through the section endpoint",
        ).toEqual([]);
    });

    test("the account rail names the customer only after the client fills it in", { tag: "@behaviour:private-sections" }, async ({ page }) => {
        const response = await page.goto("/");
        const served = (await response?.text()) ?? "";

        expect(served.includes("e2e@obsidian.test"), "the home page is cacheable").toBe(false);

        await page.goto("/customer/account/");
        await expect(page.locator(".account-rail")).toContainText(/ada/i, { timeout: 20_000 });
    });
});
