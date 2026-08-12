import { expect, test } from "@playwright/test";
import { readFixture } from "../src/env";

const fixture = readFixture();

test.describe("structured data", () => {
    test.skip(!fixture?.hostileReviewUrl, "no tokenizer probe in the fixture");

    test("a review written to break out of the JSON-LD block does not", async ({ page }) => {
        await page.goto(fixture!.hostileReviewUrl!);

        const blocks = page.locator('script[type="application/ld+json"]');

        // The count is the tell. One block means the tokenizer never left script
        // data: the probe's title closed nothing, so every later block — and the
        // rest of the document with them — was read as this one's content.
        expect(await blocks.count()).toBeGreaterThan(1);

        for (const raw of await blocks.allTextContents()) {
            expect(() => JSON.parse(raw)).not.toThrow();
        }

        // Islands live below the reviews section; if the document had collapsed
        // they would never have been reached, let alone hydrated.
        await expect(page.getByRole("contentinfo")).toBeVisible();
        expect(await page.locator("body > *").count()).toBeGreaterThan(1);
    });
});
