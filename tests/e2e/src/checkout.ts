import { expect, type Locator, type Page } from "@playwright/test";

export const SIMPLE_PRODUCT = "/driven-backpack.html";

export interface CheckoutAddress {
    firstname: string;
    lastname: string;
    street: string;
    city: string;
    region: string;
    postcode: string;
    telephone: string;
}

export const ADDRESS: CheckoutAddress = {
    firstname: "Ada",
    lastname: "Obsidian",
    street: "77 Fixture Way",
    city: "Dallas",
    region: "Texas",
    postcode: "75201",
    telephone: "5551234567",
};

export const shippingMethods = (page: Page): Locator => page.locator('input[name="shipping-method"]');
export const paymentSection = (page: Page): Locator => page.locator("#onepage-payment");
export const placeOrder = (page: Page): Locator => page.locator("[data-place-order]");
export const addressFields = (page: Page): Locator => page.locator("[data-address-fields]");
export const savedAddresses = (page: Page): Locator =>
    page.locator('[data-saved-addresses] input[type="radio"]');

const control = (page: Page, name: string): Locator =>
    addressFields(page).locator(`[id$="-${name}"]`).first();

export async function cartCount(page: Page): Promise<number> {
    const status = page.locator(".cart-count [role=status]").first();
    if (!(await status.count())) {
        return 0;
    }
    return Number(((await status.innerText()).match(/\d+/) ?? ["0"])[0]);
}

export async function addToCart(page: Page, url = SIMPLE_PRODUCT): Promise<void> {
    await page.goto(url);
    const submit = page.locator("form.pdp__form button[type=submit]").first();
    await expect(submit).toBeEnabled();
    const before = await cartCount(page);

    await submit.click();

    await expect.poll(() => cartCount(page), { timeout: 20_000 }).toBeGreaterThan(before);
}

export async function openCheckout(page: Page): Promise<void> {
    await page.goto("/checkout/");
    await expect(page.locator("#onepage-information-heading")).toBeVisible();
    await expect(page.locator("aside ul li").first()).toBeVisible({ timeout: 20_000 });
}

export async function fillAddress(page: Page, address: CheckoutAddress = ADDRESS): Promise<void> {
    await control(page, "firstname").fill(address.firstname);
    await control(page, "lastname").fill(address.lastname);
    await addressFields(page).locator('[id$="-street"]').first().fill(address.street);
    await control(page, "city").fill(address.city);
    await addressFields(page).locator('[id$="-region"]').first().selectOption({ label: address.region });
    await control(page, "postcode").fill(address.postcode);
    await control(page, "telephone").fill(address.telephone);
}

export const addressValue = (page: Page, name: string): Promise<string> =>
    control(page, name).inputValue();

export const streetValue = (page: Page): Promise<string> =>
    addressFields(page).locator('[id$="-street"]').first().inputValue();

export async function useNewAddress(page: Page): Promise<void> {
    await savedAddresses(page).last().check();
}

export async function doNotSaveAddress(page: Page): Promise<void> {
    const box = page.locator("[data-save-address] input");
    if (await box.count()) {
        await box.uncheck();
    }
}

export async function expectReadyToPay(page: Page): Promise<void> {
    await expect(shippingMethods(page).first()).toBeVisible({ timeout: 20_000 });
    await expect(paymentSection(page)).toBeVisible({ timeout: 20_000 });
    await expect(placeOrder(page)).toBeEnabled({ timeout: 20_000 });
}
