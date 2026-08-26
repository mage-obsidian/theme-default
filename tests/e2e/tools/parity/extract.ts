import { parseArgs } from "node:util";
import { collectCoreHandles, countByModule } from "./coreHandles.ts";
import { vendorLayoutSource } from "./vendorLayoutSource.ts";

const { values } = parseArgs({
    options: {
        vendor: { type: "string" },
        area: { type: "string", default: "frontend" },
        json: { type: "boolean", default: false },
        module: { type: "string" },
    },
});

if (!values.vendor) {
    console.error("usage: node tools/parity/extract.ts --vendor <path/to/vendor/magento> [--area frontend] [--json] [--module Magento_Sales]");
    process.exit(2);
}

const handles = collectCoreHandles(vendorLayoutSource(values.vendor), values.area);
const selected = values.module ? handles.filter((entry) => entry.module === values.module) : handles;

if (values.json) {
    console.log(JSON.stringify(selected, null, 2));
} else {
    const counts = [...countByModule(selected)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [module, count] of counts) {
        console.log(`${String(count).padStart(4)}  ${module}`);
    }
    console.log(`\n${selected.length} handles across ${counts.length} modules (area: ${values.area})`);
}
