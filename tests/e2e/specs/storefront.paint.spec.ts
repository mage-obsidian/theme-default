import { expect, test } from "@playwright/test";
import {
    happyPath,
    installPaintProbe,
    NO_THROTTLING,
    readBlinks,
    readIslands,
    settle,
    throttle,
} from "../src/paint";

/**
 * The storefront must arrive finished. These tests do not measure speed; they
 * measure whether anything the server already painted is thrown away and drawn
 * again — the flash that no layout-shift score reports, because nothing moves.
 */

const instrument = () => {
    test.beforeEach(async ({ context, page }) => {
        await installPaintProbe(context);
        test.skip(!(await throttle(context, page)), NO_THROTTLING);
    });
};

test.describe("islands", () => {
    instrument();

    for (const step of happyPath) {
        test(`${step.name} adopts the markup the server sent`, { tag: "@behaviour:client-startup" }, async ({ page }) => {
            await page.goto(step.path, { waitUntil: "commit" });
            await page.waitForLoadState("load").catch(() => {});
            await settle(page);

            const islands = await readIslands(page);
            expect(islands.length, "no islands found — the probe or the page is wrong").toBeGreaterThan(0);

            const discarded = islands
                .filter((i) => i.declaresHydrate && !i.exempt && i.serverChildren > 0 && i.survivedChildren === 0)
                .map((i) => i.component);
            expect(discarded, "islands that asked to hydrate but were rebuilt from scratch").toEqual([]);
        });
    }

    test("every eager island above the fold carries a state to adopt", { tag: "@behaviour:client-startup" }, async ({ page }) => {
        await page.goto("/", { waitUntil: "commit" });
        await settle(page, 2000);

        const bare = (await readIslands(page))
            .filter((i) => i.strategy === "eager" && i.inView && i.serverChildren === 0)
            .map((i) => i.component);
        expect(bare, "eager islands in view with an empty container mount into a hole").toEqual([]);
    });
});

test.describe("no blank ticks", () => {
    instrument();

    for (const step of happyPath) {
        test(`${step.name} never blanks a region it already painted`, { tag: "@behaviour:client-startup" }, async ({ page }) => {
            await page.goto(step.path, { waitUntil: "commit" });
            await page.waitForLoadState("load").catch(() => {});
            await settle(page);

            expect(await readBlinks(page)).toEqual([]);
        });
    }
});
