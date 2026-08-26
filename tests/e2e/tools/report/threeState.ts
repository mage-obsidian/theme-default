import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { classifyOutcome, tally, type Outcome } from "./outcome.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(here, "../../.artifacts");

interface Line {
    project: string;
    title: string;
    outcome: Outcome;
    reason: string | null;
    tags: string[];
}

export default class ThreeStateReporter implements Reporter {
    private readonly lines: Line[] = [];

    onTestEnd(test: TestCase, result: TestResult): void {
        const annotations = [...(test.annotations ?? []), ...((result as { annotations?: typeof test.annotations }).annotations ?? [])];
        const verdict = classifyOutcome(result.status, annotations);
        this.lines.push({
            project: test.parent.project()?.name ?? "unknown",
            title: test.titlePath().filter(Boolean).join(" › "),
            outcome: verdict.outcome,
            reason: verdict.reason,
            tags: test.tags ?? [],
        });
    }

    onEnd(_result: FullResult): void {
        const counts = tally(this.lines.map((line) => ({ outcome: line.outcome, reason: line.reason })));
        const notExecuted = this.lines.filter((line) => line.outcome === "not-executed");

        console.log(
            `\nthree-state summary: ${counts.passed} passed · ${counts.failed} failed · ${counts.notExecuted} not executed`,
        );
        for (const line of notExecuted) {
            console.log(`  not executed  [${line.project}] ${line.title}\n                ${line.reason}`);
        }

        if (!existsSync(ARTIFACTS)) {
            mkdirSync(ARTIFACTS, { recursive: true });
        }
        writeFileSync(
            resolve(ARTIFACTS, "run-summary.json"),
            `${JSON.stringify({ counts, tests: this.lines }, null, 2)}\n`,
        );
    }
}
