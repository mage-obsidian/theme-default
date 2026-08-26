import { expect, test } from "@playwright/test";

const CONTACT = "/contact/";

test.describe("the form key that survives the page cache", () => {
    test("a form served from a cached page submits and reaches the controller", { tag: "@behaviour:form-key" }, async ({ page }) => {
        await page.goto(CONTACT);
        await expect(page.locator("input[name='form_key']").first()).toHaveCount(1);

        const cookie = await page.evaluate(() => document.cookie.match(/form_key=([^;]+)/)?.[1] ?? "");
        expect(cookie, "the provider seeds the cookie on every page").toBeTruthy();

        const stamped = await page.locator("input[name='form_key']").first().inputValue();
        expect(stamped).toBe(cookie);
    });

    test("a form key that does not match the session is refused", { tag: "@behaviour:form-key" }, async ({ page }) => {
        await page.goto(CONTACT);

        await page.locator("input[name='form_key']").first().evaluate((node) => {
            (node as HTMLInputElement).value = "not-a-real-form-key";
        });
        await page.locator("input[name='name']").first().fill("Ada");
        await page.locator("input[name='email']").first().fill("ada@obsidian.test");
        await page.locator("textarea[name='comment']").first().fill("A message that must not land");

        await page.locator("form").first().evaluate((form) => (form as HTMLFormElement).submit());
        await page.waitForLoadState("load");

        expect(page.url(), "a rejected post is bounced back rather than reaching the controller").not.toMatch(/contact\/index\/post/);
    });

    test("a page older than the cookie still submits, because the key is stamped on the way out", { tag: "@behaviour:form-key" }, async ({ page }) => {
        await page.goto(CONTACT);

        await page.evaluate(() => {
            document.cookie = "form_key=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        });

        await page.locator("input[name='name']").first().fill("Ada");
        await page.locator("input[name='email']").first().fill("ada@obsidian.test");
        await page.locator("textarea[name='comment']").first().fill("Sent from a stale page");
        await page.locator("form button[type=submit], form [type=submit]").first().click();

        await page.waitForLoadState("load");
        const revived = await page.evaluate(() => document.cookie.match(/form_key=([^;]+)/)?.[1] ?? "");
        expect(revived, "the provider mints a fresh key when the cookie has gone").toBeTruthy();
    });
});
