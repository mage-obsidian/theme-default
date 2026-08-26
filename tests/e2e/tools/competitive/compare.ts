import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fromModuleRoot, fromStorefrontModule, fromThemeRoot } from "./collect.ts";
import { compareSurfaces, normaliseSurface, summarise, surfaceOf, type TemplateFile } from "./themeTree.ts";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../.artifacts");

const argument = (name: string): string | undefined => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
};

const referenceRoot = argument("reference");
const workspace = argument("workspace") ?? resolve(here, "../../../../../../../../../..");
const themeRoot = argument("theme") ?? resolve(here, "../../../..");

if (!referenceRoot || !existsSync(referenceRoot)) {
    console.error(
        "usage: node tools/competitive/compare.ts --reference <checkout of the reference repos> " +
            "[--workspace <ObsidianProject>] [--theme <the MageObsidian theme>]",
    );
    process.exit(1);
}

const reference: TemplateFile[] = [
    ...fromThemeRoot(join(referenceRoot, "magento2-default-theme")),
    ...fromModuleRoot(join(referenceRoot, "magento2-theme-module"), "Hyva_Theme"),
];

const ours: TemplateFile[] = [
    ...fromThemeRoot(themeRoot),
    ...fromThemeRoot(resolve(themeRoot, "../theme-base")),
    ...readdirSync(workspace)
        .filter((entry) => entry.startsWith("module-"))
        .flatMap((entry) => fromStorefrontModule(join(workspace, entry))),
];

const referenceSurface = normaliseSurface(surfaceOf(reference));
const ourSurface = normaliseSurface(surfaceOf(ours));
const comparisons = compareSurfaces(referenceSurface, ourSurface);
const counts = summarise(comparisons);

console.log(
    `reference: ${reference.length} templates in ${referenceSurface.length} modules · ` +
        `ours: ${ours.length} templates in ${ourSurface.length} modules`,
);
console.log(`modules in both: ${counts.both} · only in the reference: ${counts["reference-only"]} · only here: ${counts["ours-only"]}`);
console.log("");

for (const entry of comparisons) {
    const mark = entry.verdict === "both" ? " " : entry.verdict === "reference-only" ? ">" : "<";
    console.log(
        `${mark} ${entry.module.padEnd(38)} reference ${String(entry.referenceTemplates).padStart(3)} · ours ${String(entry.ourTemplates).padStart(3)} · shared ${String(entry.shared.length).padStart(3)}`,
    );
}

if (!existsSync(OUT)) {
    mkdirSync(OUT, { recursive: true });
}
writeFileSync(
    resolve(OUT, "competitive-structure.json"),
    `${JSON.stringify({ counts, comparisons }, null, 2)}\n`,
);
console.log(`\nwrote ${resolve(OUT, "competitive-structure.json")}`);

const perimeter = resolve(here, "../../competitive/perimeter.json");
if (existsSync(perimeter)) {
    const pinned = JSON.parse(readFileSync(perimeter, "utf8")) as { inside: { repository: string; revision: string }[] };
    console.log(`compared against ${pinned.inside.length} pinned revisions from competitive/perimeter.json`);
}
