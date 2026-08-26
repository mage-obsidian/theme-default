import { expect, test } from "@playwright/test";
import { readFixture } from "../src/env";
import { accountRoutes } from "../src/routes";
import { expectAccountShell } from "../src/account";

const fixture = readFixture();

test.describe("order history", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(accountRoutes.orders.path);
    });

    test("pages the list instead of silently cutting it at ten", { tag: "@cap:sales_order_history" }, async ({ page }) => {
        // The core block builds its pager in PHP and never rendered it, which also
        // page-sized the collection: everything past the tenth order was invisible
        // with no way to reach it.
        const cards = page.locator("ul > li.account-panel");
        await expect(cards).toHaveCount(10);

        const amount = page.locator(".pager .toolbar-amount");
        await expect(amount).toContainText("Items 1 to 10 of");

        // textContent, not innerText: the pager is styled uppercase and innerText
        // hands back what the CSS rendered.
        const total = Number(((await amount.textContent()) ?? "").match(/of\s+([\d.,]+)/)?.[1]?.replace(/\D/g, "") ?? 0);
        expect(total).toBeGreaterThan(10);

        // The page number sits next to an sr-only "Page", so the accessible name
        // of the second-page link reads "Page 2".
        await page.locator(".pages-items").getByRole("link", { name: /^Page\s*2$/ }).click();
        await expect(page.locator(".pager .toolbar-amount")).toContainText("Items 11 to");
        expect(await cards.count()).toBe(Math.min(10, total - 10));
    });

    test("each card carries thumbnails, a toned chip and its actions", { tag: "@cap:sales_order_history" }, async ({ page }) => {
        const card = page.locator("ul > li.account-panel").first();

        await expect(card.locator(".order-thumbs__item").first()).toBeVisible();
        await expect(card.getByRole("link", { name: "View Order" })).toBeVisible();
        await expect(card.getByRole("button", { name: "Reorder" })).toBeVisible();

        const tones = await page
            .locator(".chip")
            .evaluateAll((nodes) => nodes.map((node) => node.className.match(/chip--(\w+)/)?.[1]));

        // Tone comes from the order STATE, so a store with several states must show
        // several tones — a single grey pill everywhere is the bug this replaced.
        expect(new Set(tones.filter(Boolean)).size).toBeGreaterThan(1);
    });

    test("reordering goes through a native POST with a form key", { tag: "@cap:sales_order_reorder" }, async ({ page }) => {
        const form = page.locator("form", { has: page.getByRole("button", { name: "Reorder" }) }).first();

        await expect(form).toHaveAttribute("method", "post");
        await expect(form).toHaveAttribute("action", /sales\/order\/reorder/);
        await expect(form.locator('input[name="form_key"]')).toHaveCount(1);
    });
});

test.describe("order detail", () => {
    test.skip(!fixture?.documentedOrderId, "no invoiced order in the fixture");

    const path = (segment: string): string =>
        `/sales/order/${segment}/order_id/${fixture?.documentedOrderId}/`;

    test("shows the fulfilment track, the panels and one heading", { tag: "@cap:sales_order_view" }, async ({ page }) => {
        await page.goto(`/sales/order/view/order_id/${fixture?.trackableOrderId}/`);

        await expectAccountShell(page, /^Order #\d+$/, "My Orders");
        await expect(page.locator(".order-track")).toBeVisible();
        await expect(page.locator(".order-track__step")).toHaveCount(4);
        await expect(page.locator(".order-track__step--done").first()).toBeVisible();

        for (const title of ["Items Ordered", "Billing Address", "Shipping Address", "Payment Method"]) {
            await expect(page.locator(".account-panel__title", { hasText: title })).toBeVisible();
        }
    });

    test("the track is decorative — the chip is what carries the status", { tag: "@cap:sales_order_view" }, async ({ page }) => {
        await page.goto(`/sales/order/view/order_id/${fixture?.trackableOrderId}/`);

        await expect(page.locator(".order-track")).toHaveAttribute("aria-hidden", "true");
        await expect(page.locator(".account-head .chip")).toBeVisible();
    });

    for (const [segment, label, panel] of [
        ["invoice", "Invoices", "Invoice #"],
        ["shipment", "Order Shipments", "Shipment #"],
        ["creditmemo", "Refunds", "Refund #"],
    ] as const) {
        test(`the ${label.toLowerCase()} tab renders its documents`, { tag: `@cap:sales_order_${segment}` }, async ({ page }) => {
            await page.goto(path(segment));

            await expect(page.locator(".order-links [aria-current='page']")).toHaveText(label);
            await expect(page.locator(".account-panel__title", { hasText: panel }).first()).toBeVisible();
            await expect(page.locator("h1")).toHaveCount(1);
        });
    }

    test("the print view drops the shell and keeps the order", { tag: "@cap:sales_order_print" }, async ({ page }) => {
        await page.goto(`/sales/order/print/order_id/${fixture?.documentedOrderId}/`);

        await expect(page.locator("h1")).toHaveText(/^Order #\d+$/);
        await expect(page.locator(".account-rail")).toHaveCount(0);
        await expect(page.locator(".account-panel__title", { hasText: "Items Ordered" })).toBeVisible();
    });
});
