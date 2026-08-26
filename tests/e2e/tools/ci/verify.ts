import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, exitCode, NO_STOREFRONT, render, tally, unmetDependency, type CheckResult } from "./checks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const ARTIFACTS = resolve(ROOT, ".artifacts");

const mode = process.argv.includes("--gate") ? "gate" : "informative";
const baseUrl = process.env.E2E_BASE_URL ?? "https://zento-obsidian.test";

const storefrontAnswers = (): boolean => {
    const probe = spawnSync(
        "curl",
        ["-s", "-o", "/dev/null", "-k", "--noproxy", "*", "--max-time", "10", "-w", "%{http_code}", baseUrl],
        { encoding: "utf8" },
    );
    return probe.status === 0 && probe.stdout.startsWith("2");
};

const live = storefrontAnswers();
const results: CheckResult[] = [];

for (const check of CHECKS) {
    if (check.needsStorefront && !live) {
        results.push({ name: check.name, outcome: "not-executed", reason: NO_STOREFRONT, gate: check.gate, output: "" });
        continue;
    }
    const unmet = unmetDependency(check, results);
    if (unmet !== null) {
        results.push({ name: check.name, outcome: "not-executed", reason: unmet, gate: check.gate, output: "" });
        continue;
    }
    const run = spawnSync(check.command, check.args, { cwd: ROOT, encoding: "utf8", env: process.env, shell: false });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    results.push({
        name: check.name,
        outcome: run.status === 0 ? "passed" : "failed",
        reason: run.status === 0 ? null : `${check.what} — see the output below`,
        gate: check.gate,
        output: output.slice(-4000),
    });
}

console.log(`verification, ${mode} mode, against ${baseUrl}${live ? "" : " (which did not answer)"}\n`);
console.log(render(results));

for (const result of results.filter((entry) => entry.outcome === "failed")) {
    console.log(`\n--- ${result.name} ---\n${result.output}`);
}

if (!existsSync(ARTIFACTS)) {
    mkdirSync(ARTIFACTS, { recursive: true });
}
writeFileSync(
    resolve(ARTIFACTS, "verification.json"),
    `${JSON.stringify({ mode, baseUrl, live, counts: tally(results), results: results.map(({ output, ...rest }) => rest) }, null, 2)}\n`,
);

process.exit(exitCode(results, mode));
