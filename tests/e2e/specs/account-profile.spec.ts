import { expect, test } from "@playwright/test";
import { customer } from "../src/env";
import { accountRoutes } from "../src/routes";
import { expectAccountShell, field } from "../src/account";

test.describe("account information", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(accountRoutes.edit.path);
    });

    test("separates who you are from how you get in", { tag: "@cap:customer_account_edit" }, async ({ page }) => {
        await expectAccountShell(page, "Account Information", "Account Information");

        await expect(page.locator(".account-panel__title", { hasText: "Personal Details" })).toBeVisible();
        await expect(page.locator(".account-panel__title", { hasText: "Sign-in" })).toBeVisible();

        await expect(field(page, "First Name")).toHaveValue(customer.firstName);
        await expect(field(page, "Last Name")).toHaveValue(customer.lastName);
    });

    test("the email and password fieldsets stay shut until asked for", { tag: "@cap:customer_account_edit" }, async ({ page }) => {
        await expect(page.locator("[data-email-fields]")).toBeHidden();

        await page.getByLabel("Change Email").check();
        await expect(page.locator("[data-email-fields]")).toBeVisible();
        await expect(field(page, "Email")).toHaveValue(customer.email);

        await page.getByLabel("Change Email").uncheck();
        await expect(page.locator("[data-email-fields]")).toBeHidden();
    });

    test("saves a name change and puts it back", { tag: "@cap:customer_account_edit" }, async ({ page }) => {
        await field(page, "First Name").fill("Adalyn");
        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(/\/customer\/account/, { waitUntil: "domcontentloaded" });

        await expect(page.locator("h1")).toHaveText("Hello, Adalyn");

        await page.goto(accountRoutes.edit.path);
        await field(page, "First Name").fill(customer.firstName);
        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(/\/customer\/account/, { waitUntil: "domcontentloaded" });
        await expect(page.locator("h1")).toHaveText(`Hello, ${customer.firstName}`);
    });
});

test.describe("newsletter", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(accountRoutes.newsletter.path);
    });

    test("states the subscription with a toned chip", { tag: "@cap:newsletter_manage_index" }, async ({ page }) => {
        await expectAccountShell(page, "Newsletter Subscriptions", "Newsletter Subscriptions");

        const chip = page.locator(".account-panel__head .chip");
        await expect(chip).toBeVisible();
        await expect(chip).toHaveText(/Subscribed|Not subscribed/);
    });

    test("unsubscribing and resubscribing both stick", { tag: "@cap:newsletter_manage_index" }, async ({ page }) => {
        const box = page.getByLabel("General Subscription");
        const wasSubscribed = await box.isChecked();

        await box.setChecked(!wasSubscribed);
        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(/customer\/account|newsletter/, { waitUntil: "domcontentloaded" });

        await page.goto(accountRoutes.newsletter.path);
        await expect(page.getByLabel("General Subscription")).toBeChecked({ checked: !wasSubscribed });

        await page.getByLabel("General Subscription").setChecked(wasSubscribed);
        await page.getByRole("button", { name: "Save" }).click();
        await page.waitForURL(/customer\/account|newsletter/, { waitUntil: "domcontentloaded" });

        await page.goto(accountRoutes.newsletter.path);
        await expect(page.getByLabel("General Subscription")).toBeChecked({ checked: wasSubscribed });
    });

    test("saving works without JS: a native POST with a form key", { tag: "@behaviour:form-key" }, async ({ page }) => {
        const form = page.locator("form", { has: page.getByRole("button", { name: "Save" }) });

        await expect(form).toHaveAttribute("method", "post");
        await expect(form).toHaveAttribute("action", /newsletter\/manage\/save/);
        await expect(form.locator('input[name="form_key"]')).toHaveCount(1);
    });
});
