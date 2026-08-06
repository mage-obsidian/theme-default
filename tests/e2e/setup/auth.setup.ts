import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE, customer, customerPassword } from "../src/env";
import { field } from "../src/account";

/**
 * Signs the fixture customer in once and hands the session to every other project.
 *
 * The sign-in goes through the real form rather than a session shortcut, so a
 * broken login page fails here loudly instead of leaving every account spec
 * mysteriously redirected.
 */
setup("sign the fixture customer in", async ({ page }) => {
    await page.goto("/customer/account/login");

    const captcha = page.locator('input[name*="captcha"]');
    if (await captcha.count()) {
        throw new Error(
            "The sign-in form is asking for a CAPTCHA the theme does not render. " +
                "Re-run the seed (tools/seed.php) to clear the lockout.",
        );
    }

    await field(page, "Email").fill(customer.email);
    await field(page, "Password").fill(customerPassword());
    await page.getByRole("button", { name: "Sign In" }).click();

    await page.waitForURL(/\/customer\/account\/?$/, { timeout: 20_000 });
    await expect(page.locator("h1")).toContainText(customer.firstName);

    await page.context().storageState({ path: AUTH_STATE });
});
