import { expect, test } from "@playwright/test";
import { readFixture } from "../src/env";
import { authRoutes } from "../src/routes";
import { field } from "../src/account";

const fixture = readFixture();

test.describe("split-screen authentication", () => {
    for (const [name, route] of Object.entries(authRoutes)) {
        test(`${name} is a split screen with one heading`, async ({ page }) => {
            await page.goto(route.path);

            await expect(page.locator("h1")).toHaveCount(1);
            await expect(page.locator("h1")).toHaveText(route.heading);
            await expect(page.locator(".auth-split")).toBeVisible();
            await expect(page.locator(".auth-split__form")).toBeVisible();
            await expect(page.locator(".account-rail")).toHaveCount(0);
        });
    }

    test("the obsidian panel is decorative and says nothing that is only said there", async ({ page }) => {
        await page.goto(authRoutes.login.path);

        const aside = page.locator(".auth-split__aside");
        await expect(aside).toBeVisible();
        await expect(aside).toHaveAttribute("aria-hidden", "true");
        expect(await aside.locator(".auth-split__item").count()).toBeGreaterThan(0);
    });

    test("the panel steps aside on a phone", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 780 });
        await page.goto(authRoutes.login.path);

        await expect(page.locator(".auth-split__aside")).toBeHidden();
        await expect(page.locator(".auth-split__form")).toBeVisible();
        await expect(field(page, "Email")).toBeVisible();
    });

    test("sign-in works without JS: a native POST with a form key", async ({ page }) => {
        await page.goto(authRoutes.login.path);
        const form = page.locator("[data-login-form]");

        await expect(form).toHaveAttribute("method", "post");
        await expect(form).toHaveAttribute("action", /customer\/account\/loginPost/);
        await expect(form.locator('input[name="form_key"]')).toHaveCount(1);
        await expect(form.getByRole("button", { name: "Sign In" })).toHaveAttribute("type", "submit");
    });

    // An unknown account rather than a wrong password: a development environment
    // may carry a module that lets any password through, and then the assertion
    // would say nothing about this page.
    test("a rejected sign-in is reported in place, not as a broken page", async ({ page }) => {
        await page.goto(authRoutes.login.path);

        await field(page, "Email").fill("nobody.here@obsidian.test");
        await field(page, "Password").fill("definitely-not-the-password");
        await page.getByRole("button", { name: "Sign In" }).click();

        // The ajax endpoint answered 500 until the payload carried captcha_form_id,
        // and the page said nothing at all.
        await expect(page.locator("[data-login-error]")).not.toBeEmpty();
        await expect(page).toHaveURL(/customer\/account\/login/);
    });

    test("the email field is validated before anything is sent", async ({ page }) => {
        await page.goto(authRoutes.login.path);

        await field(page, "Email").fill("not-an-email");
        await field(page, "Password").fill("whatever");
        await page.getByRole("button", { name: "Sign In" }).click();

        await expect(page.locator("#login-email-error")).not.toBeEmpty();
        await expect(page).toHaveURL(/customer\/account\/login/);
    });

    test("registration asks for what it needs and links back to sign-in", async ({ page }) => {
        await page.goto(authRoutes.register.path);

        await expect(field(page, "First Name")).toBeVisible();
        await expect(field(page, "Last Name")).toBeVisible();
        await expect(field(page, "Email")).toBeVisible();
        await expect(field(page, "Password")).toBeVisible();
        await expect(page.getByRole("link", { name: /Sign in/i })).toBeVisible();
    });

    test("the forgotten-password form posts natively", async ({ page }) => {
        await page.goto(authRoutes.forgot.path);

        const form = page.locator("form").filter({ has: page.getByRole("button") }).first();
        await expect(form).toHaveAttribute("method", "post");
        await expect(form.locator('input[name="form_key"]')).toHaveCount(1);
        await expect(field(page, "Email")).toBeVisible();
    });

    test("the reset screen opens on a live token", async ({ page }) => {
        test.skip(!fixture?.resetToken, "no reset token in the fixture");

        await page.goto(
            `/customer/account/createPassword/?token=${fixture!.resetToken}&id=${fixture!.customerId}`,
        );

        await expect(page.locator("h1")).toHaveText("Set a New Password");
        await expect(page.locator(".auth-split")).toBeVisible();
        await expect(field(page, "New Password")).toBeVisible();
    });

    // Magento demands a CAPTCHA after a few failed sign-ins and this template has
    // nowhere to put one, so from that point a real customer cannot get in and the
    // page does not say why. The seed switches the challenge off to keep the suite
    // moving; this is the gap it is standing in for.
    test.fixme("renders the CAPTCHA challenge when Magento asks for one", async ({ page }) => {
        await page.goto(authRoutes.login.path);
        await expect(page.locator('input[name*="captcha"]')).toBeVisible();
    });
});
