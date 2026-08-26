import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    blockedReason,
    validateBacklogItem,
    validateCapability,
    validateMigrationItem,
    type BacklogItem,
    type Capability,
    type MigrationItem,
    type Problem,
} from "./schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(here, `../../competitive/${name}`), "utf8")) as T;

const { capabilities } = read<{ capabilities: Capability[] }>("capabilities.json");
const { items: backlog } = read<{ items: BacklogItem[] }>("backlog.json");
const { items: migration } = read<{ items: MigrationItem[] }>("migration.json");

const problems: Problem[] = [
    ...capabilities.flatMap(validateCapability),
    ...backlog.flatMap((item) => validateBacklogItem(item, capabilities)),
    ...migration.flatMap(validateMigrationItem),
];

for (const issue of problems) {
    console.error(`${issue.rule}  ${issue.id}: ${issue.detail}`);
}

const counts = (list: { state?: string; verdict?: string }[], key: "state" | "verdict"): string =>
    Object.entries(
        list.reduce<Record<string, number>>((acc, entry) => {
            const value = String(entry[key]);
            acc[value] = (acc[value] ?? 0) + 1;
            return acc;
        }, {}),
    )
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => `${value}=${count}`)
        .join(" ");

console.log(`${capabilities.length} capabilities compared: ${counts(capabilities, "state")}`);
console.log(`${migration.length} migration subjects: ${counts(migration, "verdict")}`);

const blocked = backlog.map(blockedReason).filter((reason): reason is string => reason !== null);
console.log(`${backlog.length} backlog items, ${blocked.length} of them not approved for work`);

if (problems.length > 0) {
    process.exit(1);
}
console.log("the competitive comparison validates");
