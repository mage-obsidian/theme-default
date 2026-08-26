import { expect, test } from "@playwright/test";
import { AJAX, REST, SELF_RESOURCES, UNGUESSABLE_MASKS, rejected } from "../src/rest";

test.describe("what the islands call, called without the identity they assume", () => {
    for (const resource of SELF_RESOURCES) {
        test(`${resource.name} is refused without a session`, { tag: "@behaviour:island-authorization" }, async ({ request }) => {
            const response = await request.get(resource.path, { headers: AJAX });
            expect(
                response.status(),
                `${resource.path} answered ${response.status()} to a caller with no session`,
            ).toBe(401);
            expect(await response.text()).not.toContain("e2e@obsidian.test");
        });
    }

    for (const mask of UNGUESSABLE_MASKS) {
        test(`a guest cart addressed with ${mask.name} is refused`, { tag: "@behaviour:island-authorization" }, async ({ request }) => {
            const response = await request.get(`${REST}/guest-carts/${mask.value}`, { headers: AJAX });
            expect(rejected(response.status()), `answered ${response.status()} instead of refusing`).toBe(true);
        });
    }

    test("a guest cart mask is long enough that it cannot be guessed, and the page that mints it is not cacheable", { tag: "@behaviour:island-authorization" }, async ({ page }) => {
        await page.goto("/checkout/cart/");
        const response = await page.goto("/checkout/cart/");
        expect(response?.headers()["x-magento-cache-debug"], "the cart page must never be served from the edge").not.toBe("HIT");
    });
});
