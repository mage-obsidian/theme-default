import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { classifyViolations, dedupe, enforce, readViolations, type AcceptedViolation, type Violation } from "../src/csp";
import { GUEST_PAGES } from "../src/perf/pages";
import { cartCount, SIMPLE_PRODUCT } from "../src/checkout";

const here = dirname(fileURLToPath(import.meta.url));
const { accepted } = JSON.parse(
    readFileSync(resolve(here, "../security/csp-accepted.json"), "utf8"),
) as { accepted: AcceptedViolation[] };

const collected: Violation[] = [];

test.describe("the public pages under an enforcing content security policy", () => {
    test.describe.configure({ mode: "serial" });

    for (const definition of GUEST_PAGES) {
        test(`${definition.name} violates nothing that is not declared`, { tag: `@cap:${definition.capability}` }, async ({ context, page }) => {
            await enforce(context);
            if (definition.prepare) {
                await definition.prepare(page);
            }
            await page.goto(definition.path, { waitUntil: "load" });
            await page.waitForTimeout(2500);

            const violations = dedupe(await readViolations(page, definition.name));
            collected.push(...violations);

            const { undeclared } = classifyViolations(violations, accepted);
            expect(
                undeclared.map((violation) => `${violation.directive} ${violation.blocked}: ${violation.sample}`),
                "a fragment nobody declared was blocked; add it to security/csp-accepted.json naming who emits it, or stop emitting it",
            ).toEqual([]);
        });
    }

    test("a shopper can still buy under the policy, even with every inline fragment blocked", { tag: "@cap:catalog_product_view" }, async ({ context, page }) => {
        await enforce(context);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));

        const before = await (async () => {
            await page.goto(SIMPLE_PRODUCT, { waitUntil: "load" });
            return cartCount(page);
        })();

        const submit = page.locator("form.pdp__form button[type=submit]").first();
        await expect(submit).toBeEnabled();
        await submit.click();

        await expect.poll(() => cartCount(page), { timeout: 20_000 }).toBeGreaterThan(before);
        expect(errors, "the policy blocked something the page could not do without").toEqual([]);
    });

    test.afterAll(() => {
        writeFileSync(
            resolve(here, "../.artifacts/csp-violations.json"),
            `${JSON.stringify(dedupe(collected), null, 2)}\n`,
        );
    });
});
