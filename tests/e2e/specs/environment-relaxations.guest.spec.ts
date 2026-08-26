import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const REPORT = resolve(here, "../.artifacts/environment.json");

interface Relaxation {
    control: string;
    named: string;
    reason: string;
    affects: string[];
}

interface Report {
    mode: string;
    store: string;
    checkedAt: string;
    relaxed: Relaxation[];
}

const report: Report | null = existsSync(REPORT) ? (JSON.parse(readFileSync(REPORT, "utf8")) as Report) : null;

test.describe("what this environment relaxes", () => {
    test("the environment declares the mode and store the security checks ran against", { tag: "@behaviour:declared-environment" }, async () => {
        expect(report, "no environment report — run `pnpm security:environment` before trusting a security result").not.toBeNull();
        expect(report!.mode, "a security observation made outside production mode does not carry to production").toBe("production");
        expect(report!.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    for (const relaxation of report?.relaxed ?? []) {
        test(`the checks resting on ${relaxation.control} cannot conclude here`, { tag: "@behaviour:declared-environment" }, async () => {
            test.fixme(
                true,
                `${relaxation.named}: ${relaxation.reason}. Affected: ${relaxation.affects.join(", ")}. ` +
                    "See registry entry security/environment/relaxed-controls.",
            );
        });
    }
});
