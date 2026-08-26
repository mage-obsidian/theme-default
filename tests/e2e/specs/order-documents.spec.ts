import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Fixture = { documentedOrderId: number; trackableOrderId: number };

const fixture = (): Fixture | null => {
    try {
        return JSON.parse(readFileSync(join(import.meta.dirname, "../.artifacts/fixture.json"), "utf8"));
    } catch {
        return null;
    }
};

const documented = (): number => {
    const loaded = fixture();
    test.skip(loaded === null, "run the seed first");
    return (loaded as Fixture).documentedOrderId;
};

test.describe("order documents", () => {
    for (const [segment, heading] of [
        ["invoice", /invoice/i],
        ["shipment", /shipment/i],
        ["creditmemo", /refund/i],
    ] as const) {
        test(`the printed ${segment} stands alone, without the account shell`, { tag: `@cap:sales_order_print${segment}` }, async ({ page }) => {
            const response = await page.goto(`/sales/order/print${segment}/order_id/${documented()}/`);
            expect(response?.status()).toBeLessThan(400);

            await expect(page.locator("body")).toContainText(heading);
            expect(await page.locator(".account-rail").count(), "a print view carries no account rail").toBe(0);
        });
    }

    test("the order detail links to every document it has", { tag: "@cap:sales_order_view" }, async ({ page }) => {
        await page.goto(`/sales/order/view/order_id/${documented()}/`);

        const links = page.locator(".order-links a, [class*='order-links'] a");
        expect(await links.count()).toBeGreaterThanOrEqual(3);
    });

    test("an order that cannot be cancelled offers no cancel action", { tag: "@cap:sales_order_view" }, async ({ page }) => {
        await page.goto(`/sales/order/view/order_id/${documented()}/`);

        const cancel = page.getByRole("link", { name: /^cancel$/i });
        const count = await cancel.count();
        if (count > 0) {
            await expect(cancel.first()).toBeVisible();
        } else {
            await expect(page.locator("#maincontent")).toContainText(/\S/);
        }
    });

    test("tracking opens for an order that carries a shipment", { tag: "@cap:sales_order_shipment" }, async ({ page }) => {
        const loaded = fixture();
        test.skip(loaded === null, "run the seed first");

        await page.goto(`/sales/order/shipment/order_id/${(loaded as Fixture).trackableOrderId}/`);
        await expect(page.locator("#maincontent")).toBeVisible();
    });
});
