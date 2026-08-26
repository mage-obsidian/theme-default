import { expect, test } from "@playwright/test";
import { readFixture } from "../src/env";

const fixture = readFixture();

test.describe("structured data", () => {
    test.skip(!fixture?.hostileReviewUrl, "no tokenizer probe in the fixture");

    test("a review written to break out of the JSON-LD block does not", { tag: "@behaviour:structured-data" }, async ({ page }) => {
        await page.goto(fixture!.hostileReviewUrl!);

        const blocks = page.locator('script[type="application/ld+json"]');

        expect(await blocks.count()).toBeGreaterThan(1);

        for (const raw of await blocks.allTextContents()) {
            expect(() => JSON.parse(raw)).not.toThrow();
        }

        await expect(page.getByRole("contentinfo")).toBeVisible();
        expect(await page.locator("body > *").count()).toBeGreaterThan(1);
    });
});
