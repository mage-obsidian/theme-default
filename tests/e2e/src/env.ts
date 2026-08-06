import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const baseURL = process.env.E2E_BASE_URL ?? "https://zento-obsidian.test";

export const AUTH_STATE = resolve(here, "../.artifacts/customer-state.json");

export interface Fixture {
    customerId: number;
    email: string;
    password: string;
    resetToken: string;
    orders: number;
    wishlist: number;
    reviews: number;
    documentedOrderId: number | null;
    trackableOrderId: number | null;
}

/**
 * What the seed left behind, in an ignored file. Null when it has not run — specs
 * that need a live reset token skip rather than fail, so the suite still says
 * something useful on an environment nobody has seeded.
 */
export function readFixture(): Fixture | null {
    const path = resolve(here, "../.artifacts/fixture.json");
    if (!existsSync(path)) {
        return null;
    }
    return JSON.parse(readFileSync(path, "utf8")) as Fixture;
}

const fixture = readFixture();

/** Must match tools/seed.php — the suite runs against the account it seeds. */
export const customer = {
    email: process.env.E2E_EMAIL ?? fixture?.email ?? "e2e@obsidian.test",
    firstName: "Ada",
    lastName: "Obsidian",
};

/**
 * The fixture password never appears in the repository: the seed either takes it
 * from E2E_PASSWORD or mints a fresh one, and hands it over through the ignored
 * .artifacts/fixture.json.
 */
export function customerPassword(): string {
    const password = process.env.E2E_PASSWORD ?? fixture?.password;
    if (!password) {
        throw new Error(
            "No fixture password. Run `pnpm seed` first, or set E2E_PASSWORD to the account you seeded.",
        );
    }
    return password;
}
