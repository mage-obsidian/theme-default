import { expect, test, type Page } from "@playwright/test";
import { addToCart, placeOrder, savedAddresses, shippingMethods } from "../src/checkout";

test.use({ viewport: { width: 390, height: 844 } });

const dock = (page: Page) => page.locator("[data-total-bar]");
const summaryItems = (page: Page) => page.locator("#checkout-summary-panel ul li");

const LAYOUTS = [
    { name: "stepped", path: "/checkout/?showcase=checkout_layout%3Dstepped" },
    { name: "one page", path: "/checkout/?showcase=checkout_layout%3Donepage" },
];

async function openCheckout(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await expect(dock(page)).toBeVisible({ timeout: 20_000 });

    const consent = page.locator("[data-cookie-allow]");
    if (await consent.isVisible()) {
        await consent.click();
        await expect(consent).toBeHidden();
    }
}

async function readyToPay(page: Page): Promise<void> {
    if (await savedAddresses(page).count()) {
        await savedAddresses(page).first().check();
    }

    const rates = page.getByRole("button", { name: /shipping methods/i });
    if (await rates.count()) {
        await rates.click();
    }

    await expect(shippingMethods(page).first()).toBeVisible({ timeout: 20_000 });
}

async function metrics(page: Page) {
    return page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
}

test.describe("checkout en móvil", () => {
    test.beforeEach(async ({ page }) => {
        await addToCart(page);
    });

    for (const layout of LAYOUTS) {
        test(`el layout ${layout.name} no desborda el ancho de la pantalla`, async ({ page }) => {
            await openCheckout(page, layout.path);

            const { scrollWidth, clientWidth } = await metrics(page);
            expect(scrollWidth, `${layout.name} scrollea de lado`).toBeLessThanOrEqual(clientWidth + 1);
        });

        test(`el layout ${layout.name} deja el mismo margen a ambos lados`, async ({ page }) => {
            await openCheckout(page, layout.path);

            const gutters = await page.evaluate(() => {
                const card = document.querySelector(".checkout-page .grid > *");
                const box = card!.getBoundingClientRect();
                return { left: box.left, right: document.documentElement.clientWidth - box.right };
            });

            expect(Math.abs(gutters.left - gutters.right), "los márgenes laterales no coinciden").toBeLessThanOrEqual(1);
        });
    }

    test("nada tapa el importe del pedido", async ({ page }) => {
        await openCheckout(page, LAYOUTS[0].path);

        const covered = await page.evaluate(() => {
            const value = document.querySelector(".checkout-total-bar__value")!;
            const box = value.getBoundingClientRect();
            const top = document.elementFromPoint(box.left + 4, box.top + box.height / 2);
            return !document.querySelector("[data-total-bar]")!.contains(top);
        });

        expect(covered, "otro elemento se pinta encima del importe").toBe(false);
    });

    test("el panel de features no se solapa con la barra del pedido", async ({ page }) => {
        await openCheckout(page, LAYOUTS[0].path);

        const handle = page.locator(".showcase__handle");
        test.skip((await handle.count()) === 0, "el showcase está apagado en este entorno");

        const [a, b] = [await handle.boundingBox(), await dock(page).boundingBox()];
        const overlaps =
            a!.x < b!.x + b!.width && a!.x + a!.width > b!.x && a!.y < b!.y + b!.height && a!.y + a!.height > b!.y;

        expect(overlaps, "el botón de features pisa la barra del pedido").toBe(false);
    });

    test("el resumen se abre y se cierra desde la barra", async ({ page }) => {
        await openCheckout(page, LAYOUTS[0].path);

        await expect(summaryItems(page).first()).toBeHidden();
        await expect(dock(page)).toHaveAttribute("aria-expanded", "false");

        await dock(page).click();

        await expect(summaryItems(page).first()).toBeVisible();
        await expect(dock(page)).toHaveAttribute("aria-expanded", "true");

        await dock(page).click();

        await expect(summaryItems(page).first()).toBeHidden();
    });

    test("los pasos del rail llegan al mínimo táctil", async ({ page }) => {
        await openCheckout(page, LAYOUTS[0].path);

        const buttons = page.locator(".step-rail__button");
        const total = await buttons.count();
        expect(total, "el test no encontró pasos que medir").toBeGreaterThan(0);

        for (let i = 0; i < total; i += 1) {
            const box = await buttons.nth(i).boundingBox();
            expect(box!.height, `el paso ${i + 1} es demasiado bajo para el dedo`).toBeGreaterThanOrEqual(44);
        }
    });

    test("el rail entra entero, sin cortar el paso siguiente", async ({ page }) => {
        await openCheckout(page, LAYOUTS[0].path);

        const fits = await page.evaluate(() => {
            const rail = document.querySelector(".step-rail")!;
            return rail.querySelector(".step-rail__list")!.scrollWidth <= rail.clientWidth;
        });

        expect(fits, "el rail de pasos necesita scroll horizontal").toBe(true);
    });

    test("el botón de avance ocupa el ancho de su tarjeta", async ({ page }) => {
        await openCheckout(page, LAYOUTS[0].path);

        await readyToPay(page);

        const cta = page.locator(".checkout-cta").first();
        const [box, card] = [
            await cta.boundingBox(),
            await page.locator(".checkout-page .grid > *").first().boundingBox(),
        ];

        expect(box!.width / card!.width, "el CTA no llena la tarjeta").toBeGreaterThan(0.8);
    });

    test("el pedido se puede confirmar sin que nada tape el botón", async ({ page }) => {
        await openCheckout(page, LAYOUTS[1].path);

        await readyToPay(page);
        await shippingMethods(page).first().check();
        await expect(placeOrder(page)).toBeVisible({ timeout: 20_000 });

        await placeOrder(page).scrollIntoViewIfNeeded();

        const covered = await page.evaluate(() => {
            const button = document.querySelector("[data-place-order]")!;
            const box = button.getBoundingClientRect();
            const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return !button.contains(top) && top !== button;
        });

        expect(covered, "algo se pinta encima de realizar pedido").toBe(false);
    });
});
