import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectPoints } from "./themeTemplates.ts";
import { ruleFor } from "./rules.ts";
import type { Classification } from "./unescaped.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(here, "../../security/unescaped-classification.json");

interface Document {
    schemaVersion: number;
    byHand: Classification[];
    byRule: Classification[];
}

const existing: Document = existsSync(FILE)
    ? (JSON.parse(readFileSync(FILE, "utf8")) as Document)
    : { schemaVersion: 1, byHand: [], byRule: [] };

const hand = new Set(existing.byHand.map((entry) => entry.fingerprint));
const points = collectPoints();
const byRule: Classification[] = [];
const emitted = new Set<string>();
const unmatched: string[] = [];

for (const point of points) {
    if (hand.has(point.fingerprint) || emitted.has(point.fingerprint)) {
        continue;
    }
    const rule = ruleFor(point.expression, point.context);
    if (!rule) {
        unmatched.push(`${point.fingerprint}  ${point.context.padEnd(9)}  ${point.file}:${point.line}  ${point.expression}`);
        continue;
    }
    emitted.add(point.fingerprint);
    byRule.push({
        fingerprint: point.fingerprint,
        file: point.file,
        expression: point.expression,
        context: point.context,
        origin: rule.origin,
        reason: `${rule.name}: ${rule.reason}`,
        ...(rule.guarantee ? { guarantee: rule.guarantee } : {}),
    });
}

writeFileSync(
    FILE,
    `${JSON.stringify({ schemaVersion: 1, byHand: existing.byHand, byRule }, null, 2)}\n`,
);

console.log(
    `${points.length} unescaped output points: ${existing.byHand.length} classified by hand, ${byRule.length} by rule, ${unmatched.length} unmatched`,
);
for (const line of unmatched) {
    console.log(`  unmatched  ${line}`);
}
