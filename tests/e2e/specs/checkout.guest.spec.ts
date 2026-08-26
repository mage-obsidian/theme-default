import { expect, test } from "@playwright/test";
import {
    ADDRESS,
    addToCart,
    addressValue,
    expectReadyToPay,
    fillAddress,
    openCheckout,
    streetValue,
} from "../src/checkout";

const EMAIL = "checkout.guest@obsidian.test";

test.describe("guest checkout", () => {
    test("a reload keeps the email and the address the quote already holds", { tag: "@cap:checkout_index_index" }, async ({ page }) => {
        await addToCart(page);
        await openCheckout(page);

        await page.locator("#checkout-email").fill(EMAIL);
        await page.locator("#checkout-email").blur();
        await fillAddress(page);
        await expectReadyToPay(page);

        await page.reload();
        await expectReadyToPay(page);

        expect(await page.locator("#checkout-email").inputValue()).toBe(EMAIL);
        expect(await streetValue(page)).toBe(ADDRESS.street);
        expect(await addressValue(page, "city")).toBe(ADDRESS.city);
        expect(await addressValue(page, "postcode")).toBe(ADDRESS.postcode);
    });
});
