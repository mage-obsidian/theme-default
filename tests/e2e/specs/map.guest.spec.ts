import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { RegistryEntry } from "../tools/registry/schema";
import { startable, validateRemediation, type ProposedChange } from "../tools/registry/remediation";
import type { BacklogItem } from "../tools/competitive/schema";

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(here, path), "utf8")) as T;

const registry = read<{ entries: RegistryEntry[] }>("../registry/parity.json").entries;
const { changes } = read<{ changes: ProposedChange[] }>("../registry/remediation.json");
const { items: backlog } = read<{ items: BacklogItem[] }>("../competitive/backlog.json");

const entryIds = new Set(registry.map((entry) => entry.id));
const approved = new Set(backlog.filter((item) => item.approval.state === "approved").map((item) => item.id));
const backlogFor = new Map(backlog.map((item) => [item.capabilityId, item.id]));

test.describe("the remediation list the audit derives", () => {
    test("every proposed change traces to entries that exist in the register", { tag: "@behaviour:remediation-list" }, async () => {
        const problems = validateRemediation(changes, entryIds, approved, backlogFor);
        expect(problems.map((problem) => `${problem.rule}: ${problem.name} — ${problem.detail}`)).toEqual([]);
    });

    test("the list is ordered, with no two changes claiming the same place", { tag: "@behaviour:remediation-list" }, async () => {
        const orders = changes.map((change) => change.order);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
        expect(new Set(orders).size).toBe(orders.length);
    });

    test("nothing that closes a competitive gap can be started yet", { tag: "@behaviour:remediation-list" }, async () => {
        const competitive = changes.filter((change) => change.kind === "gap");
        expect(competitive.length, "the comparison found gaps; they have to appear here").toBeGreaterThan(0);
        for (const change of competitive) {
            expect(
                startable(change, approved, backlogFor),
                `${change.name} would start without its backlog item being approved`,
            ).toBe(false);
        }
    });

    test("the changes that need no approval are the ones that fix something already ours", { tag: "@behaviour:remediation-list" }, async () => {
        for (const change of changes.filter((entry) => !entry.needsApprovalFirst)) {
            expect(change.kind, `${change.name} needs no approval, so it cannot be closing a competitive gap`).not.toBe("gap");
        }
    });
});
