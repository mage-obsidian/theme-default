import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { collectPoints, templateFiles } from "../tools/security/themeTemplates";
import { audit, type Classification } from "../tools/security/unescaped";

const here = dirname(fileURLToPath(import.meta.url));
const { byHand, byRule } = JSON.parse(
    readFileSync(resolve(here, "../security/unescaped-classification.json"), "utf8"),
) as { byHand: Classification[]; byRule: Classification[] };

test.describe("every value the theme emits unescaped is accounted for", () => {
    test("the theme still has templates to audit", { tag: "@behaviour:unescaped-output" }, async () => {
        expect(templateFiles().length, "no templates found — the walker is pointed at the wrong directory").toBeGreaterThan(100);
        expect(collectPoints().length).toBeGreaterThan(100);
    });

    test("no unescaped output point is unclassified, and none carries end-user content without a guarantee", { tag: "@behaviour:unescaped-output" }, async () => {
        const findings = audit(collectPoints(), [...byHand, ...byRule]);
        const open = findings.filter((finding) => finding.rule !== "known-defect");

        expect(open.map((finding) => `${finding.rule}: ${finding.detail}`), open.map((f) => f.detail).join("\n")).toEqual([]);
    });

    test("the defects the audit already found are still exactly the ones recorded", { tag: "@behaviour:unescaped-output" }, async () => {
        const defects = audit(collectPoints(), [...byHand, ...byRule]).filter((finding) => finding.rule === "known-defect");

        expect(
            defects.map((finding) => finding.detail.split(" (")[0]).sort(),
            "a defect appeared or disappeared; the register in registry/known-gaps.json has to say so too",
        ).toEqual([
            "Magento_Catalog/templates/product/compare/list.twig:39",
            "Magento_Catalog/templates/product/view.twig:147",
        ]);
    });
});
