import { expect, test, type Page } from "@playwright/test";
import {
    ADDRESS,
    addToCart,
    addressValue,
    expectReadyToPay,
    doNotSaveAddress,
    fillAddress,
    openCheckout,
    paymentSection,
    placeOrder,
    savedAddresses,
    shippingMethods,
    streetValue,
    useNewAddress,
} from "../src/checkout";

async function readyCheckout(page: Page): Promise<void> {
    await addToCart(page);
    await openCheckout(page);
    if (await savedAddresses(page).count()) {
        await savedAddresses(page).first().check();
    }
    await expectReadyToPay(page);
}

test.describe("checkout", () => {
    test("a saved address brings its rates and opens the payment step", async ({ page }) => {
        await readyCheckout(page);

        await expect(page.locator('input[name="shipping-method"]:checked')).toHaveCount(1);
    });

    test("emptying the address takes the rates and the payment step with it", async ({ page }) => {
        await readyCheckout(page);

        await useNewAddress(page);

        await expect(shippingMethods(page)).toHaveCount(0);
        await expect(paymentSection(page)).toBeHidden();
        await expect(page.locator("[data-rates-status]")).toContainText(/complete your address/i);
    });

    test("the order cannot close while the quote is behind the screen", async ({ page }) => {
        await readyCheckout(page);
        await useNewAddress(page);
        await doNotSaveAddress(page);
        await fillAddress(page);
        await expectReadyToPay(page);

        await page.locator('[data-address-fields] [id$="-city"]').first().fill("Houston");

        await expect(placeOrder(page)).toBeDisabled();
        await expect(page.locator("[data-shipping-pending]")).toBeVisible();
        await expect(placeOrder(page)).toBeEnabled({ timeout: 20_000 });
        await expect(page.locator("[data-shipping-pending]")).toBeHidden();
    });

    test("a reload restores the shipping choice the quote holds", async ({ page }) => {
        await readyCheckout(page);
        await useNewAddress(page);
        await doNotSaveAddress(page);
        await fillAddress(page);
        await expectReadyToPay(page);
        const method = await shippingMethods(page)
            .locator("..")
            .first()
            .evaluate((el) => el.querySelector("input")?.value ?? "");

        await page.reload();
        await expectReadyToPay(page);

        expect(await streetValue(page)).toBe(ADDRESS.street);
        expect(await addressValue(page, "city")).toBe(ADDRESS.city);
        expect(await addressValue(page, "postcode")).toBe(ADDRESS.postcode);
        await expect(page.locator(`input[name="shipping-method"][value="${method}"]`)).toBeChecked();
    });

    test("places the order and lands on the confirmation", async ({ page }) => {
        await readyCheckout(page);

        await placeOrder(page).click();

        await page.waitForURL(/checkout\/onepage\/success/, { timeout: 45_000 });
        await expect(page.locator("body")).toContainText(/thank you|order number/i);
    });
});
