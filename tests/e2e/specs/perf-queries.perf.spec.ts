import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { checkPage } from "../src/perf/budgets";
import { GUEST_PAGES } from "../src/perf/pages";
import { readBudgets } from "../src/perf/measure";

const here = dirname(fileURLToPath(import.meta.url));
const RUN = process.env.PERF_QUERY_RUN ?? "cold";
const ARTIFACT = resolve(here, `../.artifacts/queries-${RUN}.json`);

interface QueryRun {
    page: string;
    total: number;
    serverCache: string;
    byOrigin: { origin: string; count: number; inObsidian: boolean }[];
    repeated: { sql: string; table: string; count: number; origin: string; requestedBy: string | null }[];
}

const measured = (): QueryRun[] =>
    existsSync(ARTIFACT) ? (JSON.parse(readFileSync(ARTIFACT, "utf8")) as QueryRun[]) : [];

test.describe("the server side of the budget", () => {
    for (const definition of GUEST_PAGES) {
        test(`${definition.name} renders inside its query ceiling`, { tag: `@cap:${definition.capability}` }, async () => {
            const run = measured().find((entry) => entry.page === definition.name);
            test.skip(
                run === undefined,
                `no query measurement for ${definition.name}: the count comes from the database log on the server, ` +
                    "so run `pnpm perf:queries` against a stack with `dev:query-log:enable` on before this can say anything",
            );

            const budget = readBudgets().pages[definition.name];
            test.skip(!budget?.queries, `no query ceiling recorded yet for ${definition.name}`);

            const overruns = checkPage(definition.name, budget, { queries: run!.total });
            const breakdown = run!.byOrigin
                .slice(0, 8)
                .map((origin) => `${String(origin.count).padStart(4)}  ${origin.inObsidian ? "obsidian" : "core    "}  ${origin.origin}`)
                .join("\n");

            expect(overruns.map((over) => over.message), `${overruns.map((o) => o.message).join("\n")}\n${breakdown}`).toEqual([]);
        });
    }

    test("a query repeated once per collection item is reported with its count and origin", { tag: "@cap:catalog_category_view" }, async () => {
        const run = measured().find((entry) => entry.page === "plp");
        test.skip(run === undefined, "no query measurement for the listing page — run `pnpm perf:queries` first");

        const worst = run!.repeated[0];
        expect(worst, "a listing that renders many products always repeats something; none was reported").toBeDefined();
        expect(worst.count).toBeGreaterThanOrEqual(5);
        expect(worst.origin, "a repeated pattern is useless without the code it is attributed to").toMatch(/\.php:\d+$/);
    });
});
