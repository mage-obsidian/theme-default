import { parseArgs } from "node:util";
import { collectCoreHandles } from "./coreHandles.ts";
import { vendorLayoutSource } from "./vendorLayoutSource.ts";
import { collectDeclaredHandles, readContract } from "./obsidianSource.ts";
import { byCoreModule, crossReference, orphanDeclarations, summarise } from "./crossReference.ts";

const { values } = parseArgs({
    options: {
        vendor: { type: "string" },
        workspace: { type: "string" },
        contract: { type: "string" },
        module: { type: "string" },
        json: { type: "boolean", default: false },
    },
});

if (!values.vendor || !values.workspace || !values.contract) {
    console.error("usage: node tools/parity/report.ts --vendor <vendor/magento> --workspace <ObsidianProject> --contract <app/etc/mage_obsidian_frontend_modules.json> [--module Magento_Multishipping] [--json]");
    process.exit(2);
}

const coreHandles = collectCoreHandles(vendorLayoutSource(values.vendor));
const declared = collectDeclaredHandles(values.workspace);
const entries = crossReference(coreHandles, declared, readContract(values.contract));
const selected = values.module ? entries.filter((entry) => entry.coreModule === values.module) : entries;

if (values.json) {
    console.log(JSON.stringify({ entries: selected, orphans: orphanDeclarations(coreHandles, declared) }, null, 2));
} else {
    for (const [module, group] of [...byCoreModule(selected)].sort((a, b) => a[0].localeCompare(b[0]))) {
        const totals = summarise(group);
        console.log(`${module}  declared ${totals.declared}/${group.length}  not-installed ${totals["declared-not-installed"]}  suppressed ${totals.suppressed}  untouched ${totals.untouched}`);
        if (values.module) {
            for (const entry of group) {
                console.log(`   ${entry.status.padEnd(10)} ${entry.handle}${entry.declaredBy.length ? `  <- ${entry.declaredBy.join(", ")}` : ""}`);
            }
        }
    }
    const totals = summarise(selected);
    console.log(`\n${selected.length} core handles: ${totals.declared} declared, ${totals["declared-not-installed"]} declared by a module this platform does not carry, ${totals.suppressed} suppressed, ${totals.untouched} untouched`);
}
