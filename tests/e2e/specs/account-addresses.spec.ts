import { expect, test, type Page } from "@playwright/test";
import { accountRoutes } from "../src/routes";
import { expectAccountShell, field } from "../src/account";

const STREET = "77 Fixture Way";

const cardFor = (page: Page, street: string) =>
    page.locator(".address-card", { hasText: street }).first();

async function addAddress(page: Page, street: string): Promise<void> {
    await page.goto("/customer/address/new");

    await field(page, "Street Address").fill(street);
    await field(page, "City").fill("Denver");
    await page.locator("#country").selectOption("US");
    await page.locator("#region_id").selectOption({ label: "Colorado" });
    await field(page, "Zip/Postal Code").fill("80202");
    await field(page, "Phone Number").fill("3035550188");

    await page.getByRole("button", { name: "Save Address" }).click();
    // domcontentloaded, not load: something on the account pages keeps a request
    // open long enough for a full "load" wait to time the test out.
    await page.waitForURL(/\/customer\/address/, { waitUntil: "domcontentloaded" });
}

/** Playwright restarts the worker after a failure, so no test may assume the last one ran. */
async function ensureAddress(page: Page): Promise<void> {
    await page.goto(accountRoutes.addresses.path);
    if ((await page.locator(".address-card", { hasText: STREET }).count()) === 0) {
        await addAddress(page, STREET);
    }
}

test.describe("address book", () => {
    test("splits defaults from the rest and gives every entry its actions", { tag: "@cap:customer_address_index" }, async ({ page }) => {
        await page.goto(accountRoutes.addresses.path);
        await expectAccountShell(page, "Address Book", "Address Book");

        await expect(page.locator(".account-panel", { hasText: "Default Billing Address" })).toBeVisible();
        await expect(page.locator(".account-panel", { hasText: "Default Shipping Address" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Add New Address" })).toBeVisible();

        const card = page.locator(".address-card").first();
        await expect(card.locator(".address-card__name")).toBeVisible();
        await expect(card.getByRole("link", { name: "Edit" })).toBeVisible();
        await expect(card.getByRole("button", { name: "Delete" })).toBeVisible();
    });

    test("the form is sectioned and saves a new entry", { tag: "@cap:customer_address_form" }, async ({ page }) => {
        await page.goto("/customer/address/new");

        await expect(page.locator("h1")).toHaveCount(1);
        for (const section of ["Contact", "Address", "Defaults"]) {
            await expect(page.locator(".account-panel__title", { hasText: section })).toBeVisible();
        }

        await ensureAddress(page);
        await expect(cardFor(page, STREET)).toBeVisible();
    });

    test("picking a country with regions swaps the free text for a select", { tag: "@cap:customer_address_form" }, async ({ page }) => {
        await page.goto("/customer/address/new");

        await page.locator("#country").selectOption("US");
        await expect(page.locator("#region_id")).toBeVisible();
        await expect(page.locator("#region")).toBeHidden();

        // Aruba has no region list, so the free-text input has to come back.
        await page.locator("#country").selectOption("AW");
        await expect(page.locator("#region")).toBeVisible();
        await expect(page.locator("#region_id")).toBeHidden();
    });

    test("deleting asks first, and both ways out leave the address alone", { tag: "@cap:customer_address_index" }, async ({ page }) => {
        await ensureAddress(page);
        const card = cardFor(page, STREET);

        await card.getByRole("button", { name: "Delete" }).click();
        const dialog = page.locator("dialog.confirm-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(".confirm-dialog__title")).toHaveText("Delete this address?");

        await dialog.getByRole("button", { name: "Keep it" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(card).toBeVisible();

        await card.getByRole("button", { name: "Delete" }).click();
        await expect(page.locator("dialog.confirm-dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog.confirm-dialog")).toHaveCount(0);
        await expect(card).toBeVisible();
    });

    test("the dialog is modal and opens with the cautious option focused", { tag: "@cap:customer_address_index" }, async ({ page }) => {
        await ensureAddress(page);
        await cardFor(page, STREET).getByRole("button", { name: "Delete" }).click();

        const dialog = page.locator("dialog.confirm-dialog");
        await expect(dialog).toHaveAttribute("open", "");
        await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();

        // Tailwind's preflight zeroes every margin, which takes the modal <dialog>
        // out of the centre the user agent puts it in. It centres inside the body
        // box, which is where the reserved scrollbar gutter has already been taken.
        const box = await dialog.boundingBox();
        const width = await page.evaluate(() => document.body.clientWidth);
        expect(box!.x).toBeGreaterThan(0);
        expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(4);

        await page.keyboard.press("Escape");
    });

    test("delete survives without JS: it is a real POST carrying the form key", { tag: "@behaviour:form-key" }, async ({ page }) => {
        await ensureAddress(page);
        const form = page.locator("form[data-confirm-title]").first();

        await expect(form).toHaveAttribute("method", "post");
        await expect(form).toHaveAttribute("action", /customer\/address\/delete/);
        await expect(form.locator('input[name="form_key"]')).toHaveCount(1);
        await expect(form.locator('input[name="id"]')).toHaveCount(1);
        await expect(form.getByRole("button", { name: "Delete" })).toHaveAttribute("type", "submit");
    });

    test("confirming goes through and the address is gone", { tag: "@cap:customer_address_index" }, async ({ page }) => {
        await ensureAddress(page);
        await cardFor(page, STREET).getByRole("button", { name: "Delete" }).click();
        await page.locator("dialog.confirm-dialog").getByRole("button", { name: "Delete" }).click();

        await page.waitForURL(/\/customer\/address/, { waitUntil: "domcontentloaded" });
        await expect(page.locator(".address-card", { hasText: STREET })).toHaveCount(0);
    });
});
