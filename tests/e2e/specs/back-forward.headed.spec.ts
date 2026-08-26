import { expect, test } from "@playwright/test";
import { cacheablePath } from "../src/paint";

/**
 * Back returning the page the shopper left, instead of fetching and rebuilding
 * it, is a bonus this storefront cannot grant itself: whether the browser may
 * keep a page depends on the `Cache-Control` the edge cache sends, and Magento's
 * stock Varnish VCL overwrites it with `no-store`. Nothing above the edge is
 * broken without it — the pages arrive whole either way, which the paint suite
 * asserts — so this skips rather than fails where the header says no.
 *
 * Chromium also refuses to keep anything in the back/forward cache while
 * headless, so this runs in a visible browser; there is no way to assert it
 * otherwise.
 */
test.describe("back and forward", () => {
    test.skip(
        process.platform === "linux" && !process.env.DISPLAY,
        "needs a display: Chromium keeps nothing in the back/forward cache while headless",
    );

    test.beforeEach(async ({ request }) => {
        const cacheControl = (await request.get("/")).headers()["cache-control"] ?? "";
        test.skip(
            cacheControl.includes("no-store"),
            `this deployment answers cacheable pages with "${cacheControl}", and no-store forbids the ` +
                "back/forward cache — see the Varnish page in the docs",
        );
    });

    test("returns the cacheable pages from the back/forward cache", { tag: "@behaviour:bfcache" }, async ({ page }) => {
        await page.addInitScript(`addEventListener('pageshow', (e) => { window.__persisted = e.persisted; });`);

        for (const step of cacheablePath) {
            await page.goto(step.path, { waitUntil: "load" });
            await page.waitForTimeout(700);
        }

        for (let i = cacheablePath.length - 1; i > 0; i--) {
            await page.goBack({ waitUntil: "commit" });
            await page.waitForTimeout(900);
            const restored = await page.evaluate(() => window.__persisted === true).catch(() => false);
            expect(restored, `Back to ${cacheablePath[i - 1].name} reloaded instead of restoring`).toBe(true);
        }
    });
});
