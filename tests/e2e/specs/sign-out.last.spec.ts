import { expect, test } from "@playwright/test";
import { accountRoutes } from "../src/routes";
import { railLink } from "../src/account";

/**
 * Runs in its own project, after every signed-in one: signing out invalidates the
 * session server-side, so the storage state they all share stops working the
 * moment this does its job.
 */
test("signing out drops the session and closes the account off", { tag: "@cap:customer_account_logoutsuccess" }, async ({ page }) => {
    await page.goto(accountRoutes.dashboard.path);
    await railLink(page, "Sign Out").click();

    await page.waitForURL(/logoutSuccess|\/$/);

    await page.goto(accountRoutes.dashboard.path);
    await expect(page).toHaveURL(/\/customer\/account\/login/);
    await expect(page.locator(".auth-split")).toBeVisible();
});
