import { expect, test, type Locator, type Page } from "@playwright/test";
import { customer } from "../src/env";
import { accountRoutes } from "../src/routes";
import { documentScrollHeight } from "../src/account";

/** A panel is opaque when nothing behind it shows through, blur included. */
async function opacityOf(panel: Locator): Promise<{ alpha: number; blur: string }> {
    return panel.evaluate((element) => {
        const style = getComputedStyle(element);
        const match = style.backgroundColor.match(/rgba?\(([^)]+)\)/);
        const parts = match ? match[1].split(",").map((value) => parseFloat(value)) : [];
        return { alpha: parts.length === 4 ? parts[3] : 1, blur: style.backdropFilter };
    });
}

const openMore = async (page: Page): Promise<Locator> => {
    const trigger = page.locator("[data-nav-more] button").first();
    await trigger.click();
    const panel = page.locator("[data-nav-more] > ul");
    await expect(panel).toBeVisible();
    return panel;
};

test.describe("header navigation", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("[data-nav-more]")).toBeVisible();
    });

    test("the overflow menu does not grow the page when it is long", { tag: "@cap:default" }, async ({ page }) => {
        // Absolutely positioned children still count towards the document's
        // scrollable area, so an uncapped panel pushed the footer down the page.
        const before = await documentScrollHeight(page);
        const panel = await openMore(page);
        const after = await documentScrollHeight(page);

        expect(after).toBe(before);

        const box = await panel.boundingBox();
        const viewport = page.viewportSize()!;
        expect(box!.height).toBeLessThanOrEqual(viewport.height);
    });

    test("a long overflow menu scrolls inside itself", { tag: "@cap:default" }, async ({ page }) => {
        const panel = await openMore(page);

        const overflow = await panel.evaluate((element) => ({
            y: getComputedStyle(element).overflowY,
            behaviour: getComputedStyle(element).overscrollBehavior,
        }));

        expect(overflow.y).toBe("auto");
        expect(overflow.behaviour).toContain("contain");
    });

    test("the overflow panel is opaque, so dark content never reads through it", { tag: "@cap:default" }, async ({ page }) => {
        const panel = await openMore(page);
        const { alpha, blur } = await opacityOf(panel);

        expect(alpha).toBe(1);
        expect(blur).toBe("none");
    });

    test("every header dropdown is opaque; only the sticky bar stays frosted", { tag: "@cap:default" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);

        const translucent = await page.evaluate(() =>
            Array.from(document.querySelectorAll("header *"))
                .filter((element) => {
                    const style = getComputedStyle(element);
                    const parts = style.backgroundColor.match(/rgba\(([^)]+)\)/)?.[1].split(",");
                    const transparentish = !!parts && parts.length === 4 && parseFloat(parts[3]) > 0 && parseFloat(parts[3]) < 1;
                    return transparentish || style.backdropFilter !== "none";
                })
                .map((element) => element.className.toString()),
        );

        // The bar itself is meant to frost over the content scrolling beneath it.
        expect(translucent.filter((name) => !name.includes("sticky"))).toEqual([]);
    });

    test("the account dropdown opens opaque over the page", { tag: "@cap:default" }, async ({ page }) => {
        await page.goto(accountRoutes.dashboard.path);

        // The trigger is labelled "<menu> — <customer name>", so the name is what
        // identifies it; its visible text is only the name.
        const trigger = page
            .locator("header")
            .getByRole("button", { name: new RegExp(customer.firstName) });
        await trigger.click();

        const panel = page.locator(`header #${await trigger.getAttribute("aria-controls")}`);
        await expect(panel).toBeVisible();

        const { alpha, blur } = await opacityOf(panel);
        expect(alpha).toBe(1);
        expect(blur).toBe("none");
    });

    test("the pre-hydration markup is capped too", { tag: "@behaviour:client-startup" }, async ({ page }) => {
        // The server renders the nav before the island mounts; without the same cap
        // a slow load shows the defect again for as long as hydration takes.
        await page.route("**/generated/**/PrimaryNav*.js", (route) => route.abort());
        await page.goto("/");

        const before = await documentScrollHeight(page);
        const panel = page.locator("[data-nav-more] > ul, [data-nav-more] ul").first();

        if (await panel.count()) {
            const capped = await panel.evaluate((element) => getComputedStyle(element).maxHeight);
            expect(capped).not.toBe("none");
        }
        expect(await documentScrollHeight(page)).toBe(before);
    });
});
