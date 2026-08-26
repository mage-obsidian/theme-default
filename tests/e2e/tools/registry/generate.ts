import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { collectCoreHandles } from "../parity/coreHandles.ts";
import { vendorLayoutSource } from "../parity/vendorLayoutSource.ts";
import { collectDeclaredHandles, readContract } from "../parity/obsidianSource.ts";
import { crossReference } from "../parity/crossReference.ts";
import { buildParityEntries } from "./buildParityEntries.ts";
import { validateRegistry } from "./schema.ts";
import { coverageFromTags, orphanTags, parseListedTests } from "./crossCheck.ts";
import { behaviourEntries } from "./behaviours.ts";
import { applyClassification, unclassifiedSuppressed } from "./classification.ts";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { values } = parseArgs({
    options: {
        vendor: { type: "string" },
        workspace: { type: "string" },
        contract: { type: "string" },
        out: { type: "string", default: "registry/parity.json" },
        distribution: { type: "string", default: "community" },
        version: { type: "string" },
        listing: { type: "string" },
        known: { type: "string" },
        classification: { type: "string" },
    },
});

if (!values.vendor || !values.workspace || !values.contract || !values.version) {
    console.error("usage: node tools/registry/generate.ts --vendor <vendor/magento> --workspace <ObsidianProject> --contract <contract.json> --version 2.4.9 [--distribution community] [--out registry/parity.json]");
    process.exit(2);
}

const platform = { distribution: values.distribution, version: values.version };
const coreHandles = collectCoreHandles(vendorLayoutSource(values.vendor));
const parity = crossReference(coreHandles, collectDeclaredHandles(values.workspace), readContract(values.contract));
const listing = values.listing
    ? JSON.parse(readFileSync(values.listing, "utf8"))
    : JSON.parse(execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
            env: { ...process.env, PERF: "1" },
        }));
const listed = parseListedTests(listing);

const idsByHandle = new Map<string, string[]>();
for (const entry of parity) {
    const id = `parity/${entry.coreModule.toLowerCase().replace(/_/g, "-")}/${entry.handle}`;
    idsByHandle.set(entry.handle, [...(idsByHandle.get(entry.handle) ?? []), id]);
}

const coverage = coverageFromTags(listed, (capability) => idsByHandle.get(capability) ?? []);
const entries = [...buildParityEntries(parity, coverage, platform), ...behaviourEntries(listed, platform)];

const classificationRules = JSON.parse(readFileSync(values.classification ?? "registry/suppressed-classification.json", "utf8")).rules ?? [];
const classified = applyClassification(entries, classificationRules);
entries.length = 0;
entries.push(...classified);

const manual = JSON.parse(readFileSync(values.known ?? "registry/known-gaps.json", "utf8")).entries ?? [];
const manualById = new Map<string, any>(manual.map((entry: any) => [entry.id, entry]));
for (const entry of entries) {
    const override = manualById.get(entry.id);
    if (override) {
        Object.assign(entry, override);
        manualById.delete(entry.id);
    }
}
entries.push(...manualById.values());

const knownCapabilities = new Set([...idsByHandle.keys(), ...manual.map((entry: any) => entry.capabilityTag).filter(Boolean)]);
const orphans = orphanTags(listed, knownCapabilities);
for (const orphan of orphans) {
    console.error(`orphan-tag  ${orphan.id}\n    ${orphan.detail}`);
}

const problems = validateRegistry(entries);
if (problems.length > 0) {
    for (const problem of problems.slice(0, 20)) {
        console.error(`${problem.id}: ${problem.rule} - ${problem.detail}`);
    }
    console.error(`\n${problems.length} violations; registry not written`);
    process.exit(1);
}

const unclassified = unclassifiedSuppressed(entries);
for (const entry of unclassified) {
    console.error(`unclassified-suppressed  ${entry.id}`);
}

mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify({ platform, entries }, null, 2)}\n`, "utf8");

const totals = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
}, {});
console.log(`${entries.length} entries written to ${values.out}`);
console.log(Object.entries(totals).map(([status, count]) => `${status}: ${count}`).join("  "));
