import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBudgets, validateBudgets, type BudgetsDocument } from "../../src/perf/budgets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const document = JSON.parse(readFileSync(resolve(here, "../../perf/budgets.json"), "utf8")) as BudgetsDocument;

const violations = validateBudgets(document);
for (const violation of violations) {
    console.error(`${violation.page}/${violation.metric}: ${violation.rule} — ${violation.detail}`);
}

const run = process.argv[2];
const queryRun = process.argv[3];
const measurements: Record<string, Record<string, number>> = {};

if (run) {
    const measured = JSON.parse(
        readFileSync(resolve(here, `../../.artifacts/perf-${run}.json`), "utf8"),
    ) as { page: string; summary: Record<string, number> }[];
    for (const entry of measured) {
        measurements[entry.page] = { ...entry.summary };
    }
}

interface QueryRun {
    page: string;
    total: number;
    byOrigin: { origin: string; count: number; inObsidian: boolean }[];
}
let queries: QueryRun[] = [];
if (queryRun) {
    queries = JSON.parse(
        readFileSync(resolve(here, `../../.artifacts/queries-${queryRun}.json`), "utf8"),
    ) as QueryRun[];
    for (const entry of queries) {
        measurements[entry.page] = { ...(measurements[entry.page] ?? {}), queries: entry.total };
    }
}

const overruns = run || queryRun ? checkBudgets(document, measurements) : [];
for (const over of overruns) {
    console.error(over.message);
    if (over.metric === "queries") {
        const entry = queries.find((candidate) => candidate.page === over.page);
        for (const origin of entry?.byOrigin.slice(0, 8) ?? []) {
            console.error(`   ${String(origin.count).padStart(4)}  ${origin.inObsidian ? "obsidian" : "core    "}  ${origin.origin}`);
        }
    }
}

if (violations.length > 0 || overruns.length > 0) {
    process.exit(1);
}
console.log(`budgets are backed by measurements${run || queryRun ? " and every measured page stays inside them" : ""}`);
