import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFrom, queryBudgetFrom, validateBudgets, type BudgetsDocument, type PageBudget } from "../../src/perf/budgets.ts";
import { GUEST_PAGES, COLD_PAGES, ACCOUNT_PAGES } from "../../src/perf/pages.ts";

const here = dirname(fileURLToPath(import.meta.url));
const BUDGETS = resolve(here, "../../perf/budgets.json");

interface Run {
    page: string;
    path: string;
    protocol: string;
    summary: Record<string, number>;
}

const run = process.argv[2] ?? "baseline";
const today = new Date().toISOString().slice(0, 10);
const definitions = new Map(
    [...GUEST_PAGES, ...COLD_PAGES, ...ACCOUNT_PAGES].map((entry) => [entry.name, entry]),
);

const measured = JSON.parse(
    readFileSync(resolve(here, `../../.artifacts/perf-${run}.json`), "utf8"),
) as Run[];

const queryRun = process.argv[3];
const queryTotals = new Map<string, number>();
const queryCacheState = new Map<string, string>();
if (queryRun) {
    const measuredQueries = JSON.parse(
        readFileSync(resolve(here, `../../.artifacts/queries-${queryRun}.json`), "utf8"),
    ) as { page: string; total: number; serverCache: string }[];
    for (const entry of measuredQueries) {
        queryTotals.set(entry.page, entry.total);
        queryCacheState.set(entry.page, entry.serverCache);
    }
}

const document = JSON.parse(readFileSync(BUDGETS, "utf8")) as BudgetsDocument;
document.pages = document.pages ?? {};

for (const entry of measured) {
    const definition = definitions.get(entry.page);
    if (!definition) {
        console.error(`skipping "${entry.page}": no page of that name is declared in src/perf/pages.ts`);
        continue;
    }
    const derived: PageBudget = budgetFrom(definition.path, entry.protocol, entry.summary, today);
    const existing = document.pages[entry.page];
    const total = queryTotals.get(entry.page);
    const queries =
        total === undefined ? existing?.queries : queryBudgetFrom(total, today, queryCacheState.get(entry.page) ?? "unknown");
    document.pages[entry.page] = queries ? { ...derived, queries } : derived;
}

const violations = validateBudgets(document);
if (violations.length > 0) {
    for (const violation of violations) {
        console.error(`${violation.page}/${violation.metric}: ${violation.rule} — ${violation.detail}`);
    }
    process.exit(1);
}

writeFileSync(BUDGETS, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${Object.keys(document.pages).length} page budgets from run "${run}" measured ${today}`);
