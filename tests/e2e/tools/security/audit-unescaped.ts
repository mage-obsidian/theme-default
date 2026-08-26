import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectPoints, templateFiles } from "./themeTemplates.ts";
import { audit, type Classification } from "./unescaped.ts";

const here = dirname(fileURLToPath(import.meta.url));

interface Document {
    byHand: Classification[];
    byRule: Classification[];
}

const document = JSON.parse(
    readFileSync(resolve(here, "../../security/unescaped-classification.json"), "utf8"),
) as Document;

const classified = [...document.byHand, ...document.byRule];
const points = collectPoints();
const findings = audit(points, classified);

const unique = new Set(points.map((point) => point.fingerprint));
console.log(
    `${templateFiles().length} templates, ${points.length} unescaped output points (${unique.size} distinct), ` +
        `${document.byHand.length} classified by hand and ${document.byRule.length} by rule`,
);

const defects = findings.filter((finding) => finding.rule === "known-defect");
const open = findings.filter((finding) => finding.rule !== "known-defect");

for (const finding of defects) {
    console.log(`known-defect  ${finding.detail}`);
}
for (const finding of open) {
    console.error(`${finding.rule}  ${finding.detail}`);
}

if (open.length > 0) {
    process.exit(1);
}
console.log(`every unescaped output point is classified; ${defects.length} of them are recorded defects`);
