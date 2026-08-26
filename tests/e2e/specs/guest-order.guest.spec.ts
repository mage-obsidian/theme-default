import { expect, test } from "@playwright/test";
import { addToCart, ADDRESS, fillAddress, placeOrder, shippingMethods } from "../src/checkout";
import { field } from "../src/account";

const placeGuestOrder = async (page: import("@playwright/test").Page): Promise<{ increment: string; email: string }> => {
    const email = `guest-${Date.now()}@obsidian.test`;

    await addToCart(page);
    await page.goto("/checkout/");
    await expect(page.locator("#onepage-information-heading")).toBeVisible();
    await page.locator("input[type='email']").first().fill(email);
    await fillAddress(page, ADDRESS);

    const method = shippingMethods(page).first();
    await expect(method).toBeVisible({ timeout: 30_000 });
    await method.check();

    await expect(placeOrder(page)).toBeEnabled({ timeout: 30_000 });
    await placeOrder(page).click();
    await page.waitForURL(/checkout\/onepage\/success/, { timeout: 60_000 });

    const increment = ((await page.locator("#maincontent").textContent()) ?? "").match(/\b0{4,}\d+\b/)?.[0] ?? "";
    expect(increment, "the confirmation must name the order").toBeTruthy();
    return { increment, email };
};

test.describe("guest order lookup", () => {
    test("a guest finds the order they just placed and reads it", { tag: "@cap:sales_guest_form" }, async ({ page }) => {
        const { increment, email } = await placeGuestOrder(page);

        await page.goto("/sales/guest/form/");
        await expect(page.locator("h1")).toContainText(/orders and returns/i);

        await field(page, "Order ID").fill(increment);
        await field(page, "Billing Last Name").fill(ADDRESS.lastname);
        await field(page, "Email").fill(email);

        await page.locator("form button[type=submit]").first().click();

        await page.waitForURL(/sales\/guest\/view/, { timeout: 45_000 });
        await expect(page.locator("#maincontent")).toContainText(increment);
    });

    test("the lookup refuses details that match no order", { tag: "@cap:sales_guest_form" }, async ({ page }) => {
        await page.goto("/sales/guest/form/");

        await field(page, "Order ID").fill("000000000");
        await field(page, "Billing Last Name").fill("Nobody");
        await field(page, "Email").fill("nobody@obsidian.test");
        await page.locator("form button[type=submit]").first().click();

        await expect(page.locator("body")).not.toContainText(/000000000/, { timeout: 30_000 });
    });
});
