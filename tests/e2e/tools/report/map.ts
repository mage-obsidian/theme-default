import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegistryEntry } from "../registry/schema.ts";
import type { BacklogItem, Capability, MigrationItem } from "../competitive/schema.ts";
import type { BudgetsDocument } from "../../src/perf/budgets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;

const registry = read<{ entries: RegistryEntry[] }>("registry/parity.json").entries;
const budgets = read<BudgetsDocument>("perf/budgets.json");
const { capabilities } = read<{ capabilities: Capability[] }>("competitive/capabilities.json");
const { items: backlog, licenceAnalysis } = read<{ items: BacklogItem[]; licenceAnalysis: Record<string, string> }>(
    "competitive/backlog.json",
);
const { items: migration } = read<{ items: MigrationItem[] }>("competitive/migration.json");
const perimeter = read<{ productVersion: string; inside: { repository: string; revision: string }[] }>(
    "competitive/perimeter.json",
);

const count = <T>(list: T[], key: (entry: T) => string): [string, number][] =>
    Object.entries(
        list.reduce<Record<string, number>>((acc, entry) => {
            const value = key(entry);
            acc[value] = (acc[value] ?? 0) + 1;
            return acc;
        }, {}),
    ).sort((a, b) => b[1] - a[1]);

const trackOf = (entry: RegistryEntry): string => entry.id.split("/")[1] ?? "-";

const parity = registry.filter((entry) => entry.origin === "parity");
const security = registry.filter((entry) => entry.origin === "security");
const performance = registry.filter((entry) => entry.origin === "performance");
const competitive = registry.filter((entry) => entry.origin === "competitive");

const platform = parity.find((entry) => entry.platform)?.platform;

const lines: string[] = [];
const say = (text = "") => lines.push(text);

say("# The storefront verification map");
say();
say(`Generated from the registers, not written by hand. Every line below names the entry it comes from.`);
say();
say(
    `Platform: ${platform ? `${platform.distribution} ${platform.version}` : "not declared by any covered parity entry"}.`,
);
say();

say("## Parity");
say();
say(`${parity.length} capabilities derived from the frontend layout handles the installed platform ships.`);
say();
say("| Status | Entries |");
say("|---|---|");
for (const [status, total] of count(parity, (entry) => entry.status)) {
    say(`| ${status} | ${total} |`);
}
say();
say("The tracks carrying something still open:");
say();
say("| Track | Uncovered | Blocked |");
say("|---|---|---|");
const tracks = [...new Set(parity.map(trackOf))].sort();
for (const track of tracks) {
    const inTrack = parity.filter((entry) => trackOf(entry) === track);
    const uncovered = inTrack.filter((entry) => entry.status === "uncovered").length;
    const blocked = inTrack.filter((entry) => entry.status === "blocked").length;
    if (uncovered + blocked > 0) {
        say(`| ${track} | ${uncovered} | ${blocked} |`);
    }
}
say();

say("## Performance");
say();
say("Measured under the protocols declared in `src/perf/protocol.ts`; every ceiling carries the measurement behind it.");
say();
say("| Page | Protocol | LCP measured / ceiling | Transferred KB | Queries (server cache) |");
say("|---|---|---|---|---|");
for (const [page, budget] of Object.entries(budgets.pages)) {
    const lcp = budget.metrics.lcp;
    const kb = budget.metrics.transferTotal;
    const queries = budget.queries;
    say(
        `| ${page} | ${budget.protocol} | ${lcp.measured} / ${lcp.ceiling} ms | ${Math.round(kb.measured / 1024)} / ${Math.round(kb.ceiling / 1024)} | ${queries ? `${queries.measured} / ${queries.ceiling} (${queries.serverCache})` : "not measured"} |`,
    );
}
say();
for (const entry of performance) {
    say(`- **${entry.status}** · \`${entry.id}\` — ${entry.capability}`);
}
say();

say("## Security");
say();
for (const [severity, total] of count(security, (entry) => entry.severity)) {
    say(`- ${severity}: ${total}`);
}
say();
for (const entry of [...security].sort((a, b) => a.severity.localeCompare(b.severity))) {
    say(`- **${entry.severity} · ${entry.status}** · \`${entry.id}\` — ${entry.capability}`);
}
say();

say("## The comparison, first view: what the reference has that this does not");
say();
say(`Reference: ${perimeter.productVersion}. Revisions pinned in \`competitive/perimeter.json\`.`);
say();
for (const [state, total] of count(capabilities, (entry) => entry.state)) {
    say(`- ${state}: ${total}`);
}
say();
say("| Priority | Item | Effort | Approval | Motivated by |");
say("|---|---|---|---|---|");
for (const item of [...backlog].sort((a, b) => a.priority - b.priority)) {
    say(`| ${item.priority} | ${item.title} | ${item.effort} | ${item.approval.state} | \`${item.capabilityId}\` |`);
}
say();
say(`Licence: ${licenceAnalysis.finding}`);
say();
say(licenceAnalysis.consequence);
say();

say("## The comparison, second view: moving a store from the reference to here");
say();
for (const [verdict, total] of count(migration, (entry) => entry.verdict)) {
    say(`- ${verdict}: ${total}`);
}
say();
say("| Subject | Verdict | Links to |");
say("|---|---|---|");
for (const item of migration) {
    say(`| ${item.subject} | ${item.verdict} | ${item.gapId ? `\`${item.gapId}\`` : "—"} |`);
}
say();

say("## What is still open, in one list");
say();
const open = registry.filter((entry) => entry.status === "uncovered" || entry.status === "blocked");
say(`${open.length} entries. ${competitive.length} of them come from the comparison rather than from the platform.`);
say();

const ARTIFACTS = resolve(ROOT, ".artifacts");
if (!existsSync(ARTIFACTS)) {
    mkdirSync(ARTIFACTS, { recursive: true });
}
const out = resolve(ARTIFACTS, "map.md");
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`wrote ${out} — ${registry.length} register entries, ${backlog.length} backlog items, ${migration.length} migration subjects`);
