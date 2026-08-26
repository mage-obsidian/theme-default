import { expect, test } from "@playwright/test";
import { readFixture } from "../src/env";
import { AJAX, REST } from "../src/rest";

const fixture = readFixture();

test.describe("what the islands call, called as the wrong customer", () => {
    test("the session really does authorise the customer's own resources", { tag: "@behaviour:island-authorization" }, async ({ page }) => {
        await page.goto("/customer/account");
        const response = await page.request.get(`${REST}/customers/me`, { headers: AJAX });

        expect(response.status(), "the negative checks mean nothing unless this one passes").toBe(200);
        expect(await response.text()).toContain(fixture?.email ?? "e2e@obsidian.test");
    });

    test("another customer's account is refused to a signed-in customer", { tag: "@behaviour:island-authorization" }, async ({ page }) => {
        test.skip(!fixture?.customerId, "no seeded customer in the fixture — run `pnpm seed` first");

        await page.goto("/customer/account");
        const others = [1, 2, fixture!.customerId + 1, fixture!.customerId - 1].filter((id) => id > 0 && id !== fixture!.customerId);

        for (const id of others) {
            const response = await page.request.get(`${REST}/customers/${id}`, { headers: AJAX });
            expect(response.status(), `customers/${id} answered ${response.status()} to another customer's session`).toBe(401);
            expect(await response.text(), `customers/${id} returned data`).not.toContain("@");
        }
    });

    test("a signed-in customer cannot reach their own cart through the guest door", { tag: "@behaviour:island-authorization" }, async ({ page }) => {
        await page.goto("/checkout/cart/");
        const masked = await page.evaluate(() => {
            for (const node of document.querySelectorAll("[data-props]")) {
                try {
                    const props = JSON.parse(node.getAttribute("data-props") ?? "{}");
                    if (typeof props.maskedCartId === "string" && props.maskedCartId !== "") {
                        return props.maskedCartId as string;
                    }
                } catch {
                    continue;
                }
            }
            return "";
        });

        expect(masked, "a signed-in customer's page must not carry a guest cart mask at all").toBe("");
    });
});
