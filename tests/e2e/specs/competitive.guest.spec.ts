import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
    mayStartWork,
    validateBacklogItem,
    validateCapability,
    validateMigrationItem,
    type BacklogItem,
    type Capability,
    type MigrationItem,
} from "../tools/competitive/schema";

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(here, path), "utf8")) as T;

const { capabilities } = read<{ capabilities: Capability[] }>("../competitive/capabilities.json");
const { items: backlog } = read<{ items: BacklogItem[] }>("../competitive/backlog.json");
const { items: migration } = read<{ items: MigrationItem[] }>("../competitive/migration.json");
const perimeter = read<{ inside: { repository: string; revision: string; licence: string }[]; outside: unknown[] }>(
    "../competitive/perimeter.json",
);
const register = read<{ entries: { id: string }[] }>("../registry/known-gaps.json");

const known = new Set(register.entries.map((entry) => entry.id));

test.describe("the competitive comparison", () => {
    test("every repository inside the perimeter is pinned to a revision and names its licence", { tag: "@behaviour:competitive-perimeter" }, async () => {
        expect(perimeter.inside.length).toBeGreaterThan(0);
        for (const repository of perimeter.inside) {
            expect(repository.revision, `${repository.repository} is not pinned`).toMatch(/^[0-9a-f]{40}$/);
            expect(repository.licence, `${repository.repository} names no licence`).toBeTruthy();
        }
        expect(perimeter.outside.length, "what stays outside the code perimeter has to be named explicitly").toBeGreaterThan(0);
    });

    test("every comparison lands on one of the three states and declares its evidence regime", { tag: "@behaviour:competitive-perimeter" }, async () => {
        const problems = capabilities.flatMap(validateCapability);
        expect(problems.map((problem) => `${problem.rule}: ${problem.id}`)).toEqual([]);
    });

    test("nothing declared by its source is dressed up as derived from code", { tag: "@behaviour:competitive-perimeter" }, async () => {
        const declared = capabilities.filter((entry) => entry.regime === "declared-by-source");
        expect(declared.length, "the commercial parts have to appear somewhere").toBeGreaterThan(0);
        for (const entry of declared) {
            expect(entry.revisions, `${entry.id} cites a revision it cannot have`).toBeUndefined();
            expect(entry.source).toBeTruthy();
            expect(entry.sourceVersion).toBeTruthy();
        }
    });

    test("every gap points at a register entry that exists", { tag: "@behaviour:competitive-perimeter" }, async () => {
        const dangling = capabilities
            .filter((entry) => entry.state === "gap")
            .map((entry) => entry.gapId!)
            .filter((id) => !known.has(id));
        expect(dangling, "a gap that points nowhere is a claim with no register behind it").toEqual([]);
    });

    test("the backlog validates and every item still starts unapproved", { tag: "@behaviour:competitive-perimeter" }, async () => {
        const problems = backlog.flatMap((item) => validateBacklogItem(item, capabilities));
        expect(problems.map((problem) => `${problem.rule}: ${problem.id}`)).toEqual([]);

        const approved = backlog.filter(mayStartWork).map((item) => item.id);
        expect(approved, "detecting a gap does not authorise incorporating anything into MageObsidian").toEqual([]);
    });

    test("everything derived from the reference's code is marked for reimplementation", { tag: "@behaviour:competitive-perimeter" }, async () => {
        const unmarked = backlog
            .filter((item) => item.derivedFrom === "derived-from-code" && !item.reimplementFromBehaviour)
            .map((item) => item.id);
        expect(unmarked, "the reference is OSL-3.0 and this project is MIT; nothing may be carried across as code").toEqual([]);
    });

    test("every migration subject is classified, and what has no equivalent links to its gap", { tag: "@behaviour:competitive-perimeter" }, async () => {
        const problems = migration.flatMap(validateMigrationItem);
        expect(problems.map((problem) => `${problem.rule}: ${problem.id}`)).toEqual([]);

        const dangling = migration
            .filter((item) => item.verdict === "no-equivalent")
            .map((item) => item.gapId!)
            .filter((id) => !known.has(id));
        expect(dangling).toEqual([]);
    });
});
