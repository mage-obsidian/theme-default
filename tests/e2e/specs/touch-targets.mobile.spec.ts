import { expect, test } from "@playwright/test";

const WCAG_MIN_TARGET = 24;
const IOS_ZOOM_FLOOR = 16;

const FORM_PAGES = ["/customer/account/login", "/chaz-kangeroo-hoodie.html", "/gear/bags.html"];

test.describe("touch ergonomics", () => {
    for (const path of FORM_PAGES) {
        test(`no form control on ${path} is small enough to zoom iOS Safari`, { tag: "@behaviour:touch-targets" }, async ({ page }) => {
            await page.goto(path);
            await page.waitForLoadState("load");

            const { examined, offenders } = await page.evaluate((floor) => {
                const controls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
                    .filter((element) => {
                        const box = element.getBoundingClientRect();
                        return box.width > 0 && box.height > 0;
                    })
                    .map((element) => ({
                        id: element.id || element.getAttribute("name") || element.tagName,
                        fontSize: parseFloat(getComputedStyle(element).fontSize),
                    }));
                return { examined: controls.length, offenders: controls.filter((c) => c.fontSize < floor) };
            }, IOS_ZOOM_FLOOR);

            expect(examined, "el test no encontró campos que medir").toBeGreaterThan(0);
            expect(offenders, `controles bajo ${IOS_ZOOM_FLOOR}px`).toEqual([]);
        });
    }

    test("every header control is at least the WCAG 2.5.8 minimum", { tag: "@cap:default" }, async ({ page }) => {
        await page.goto("/chaz-kangeroo-hoodie.html");
        await page.waitForLoadState("load");
        await expect(page.locator("header button").first()).toBeVisible();

        const { examined, offenders } = await page.evaluate((min) => {
            const header = document.querySelector("header");
            const targets = [...(header?.querySelectorAll("a[href], button") ?? [])]
                .filter((element) => {
                    const box = element.getBoundingClientRect();
                    return box.width > 1 && box.height > 1 && !element.classList.contains("skip");
                })
                .map((element) => {
                    const box = element.getBoundingClientRect();
                    return {
                        name: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 24),
                        w: Math.round(box.width),
                        h: Math.round(box.height),
                    };
                });
            return { examined: targets.length, offenders: targets.filter((t) => Math.min(t.w, t.h) < min) };
        }, WCAG_MIN_TARGET);

        expect(examined, "el test no encontró controles que medir").toBeGreaterThanOrEqual(3);
        expect(offenders, `objetivos bajo ${WCAG_MIN_TARGET}px`).toEqual([]);
    });

    test("the product page's secondary actions clear the minimum too", { tag: "@cap:catalog_product_view" }, async ({ page }) => {
        await page.goto("/chaz-kangeroo-hoodie.html");
        await page.waitForLoadState("load");

        for (const selector of ["[data-add-to-compare] button", "form:has([name=product]) button[aria-pressed]"]) {
            const button = page.locator(selector).first();
            if ((await button.count()) === 0) continue;
            const box = await button.boundingBox();
            expect(box, selector).not.toBeNull();
            expect(Math.min(box!.width, box!.height), selector).toBeGreaterThanOrEqual(WCAG_MIN_TARGET);
        }
    });
});
