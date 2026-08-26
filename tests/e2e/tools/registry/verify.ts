import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { validateRegistry } from "./schema.ts";
import { crossCheck, orphanBehaviours, orphanTags, parseListedTests, unexplainedAbsences, type NotExecuted } from "./crossCheck.ts";
import { OBSERVABLE_BEHAVIOURS } from "./behaviours.ts";
import { existsSync } from "node:fs";

const { values } = parseArgs({
    options: {
        registry: { type: "string", default: "registry/parity.json" },
        listing: { type: "string" },
    },
});

const registry = JSON.parse(readFileSync(values.registry, "utf8"));
const entries = registry.entries ?? [];

const listing = values.listing
    ? JSON.parse(readFileSync(values.listing, "utf8"))
    : JSON.parse(execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
            env: { ...process.env, PERF: "1" },
        }));

const listed = parseListedTests(listing);

const knownCapabilities = new Set<string>(
    entries.flatMap((entry: { handles?: string[]; capabilityTag?: string }) => [
        ...(entry.handles ?? []),
        ...(entry.capabilityTag ? [entry.capabilityTag] : []),
    ]),
);

const summaryPath = ".artifacts/run-summary.json";
const absent: NotExecuted[] = existsSync(summaryPath)
    ? (JSON.parse(readFileSync(summaryPath, "utf8")).tests ?? [])
          .filter((test: { outcome: string }) => test.outcome === "not-executed")
          .map((test: { project: string; title: string; reason: string | null }) => ({
              project: test.project,
              title: test.title,
              reason: test.reason,
          }))
    : [];

const problems = [
    ...validateRegistry(entries),
    ...crossCheck(entries, listed),
    ...orphanTags(listed, knownCapabilities),
    ...orphanBehaviours(listed, new Set(Object.keys(OBSERVABLE_BEHAVIOURS))),
    ...unexplainedAbsences(absent, entries),
];

for (const problem of problems) {
    console.error(`${problem.rule}  ${problem.id}\n    ${problem.detail}`);
}

console.log(`\n${entries.length} registry entries, ${listed.length} listed tests (${listed.filter((test) => test.pending).length} pending), ${absent.length} checks the last run did not execute`);
console.log(problems.length === 0 ? "registry is consistent with the suite" : `${problems.length} inconsistencies`);
process.exit(problems.length === 0 ? 0 : 1);
