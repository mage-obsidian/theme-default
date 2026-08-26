export type CheckOutcome = "passed" | "failed" | "not-executed";

export interface Check {
    name: string;
    command: string;
    args: string[];
    gate: boolean;
    needsStorefront: boolean;
    what: string;
    dependsOn?: string;
}

export interface CheckResult {
    name: string;
    outcome: CheckOutcome;
    reason: string | null;
    gate: boolean;
    output: string;
}

export const CHECKS: Check[] = [
    {
        name: "unit",
        command: "node",
        args: ["--test", "{tools,src}/**/*.test.ts"],
        gate: true,
        needsStorefront: false,
        what: "the tools' own logic",
    },
    {
        name: "typecheck",
        command: "npx",
        args: ["tsc", "--noEmit"],
        gate: true,
        needsStorefront: false,
        what: "the harness compiles",
    },
    {
        name: "unescaped-output",
        command: "node",
        args: ["tools/security/audit-unescaped.ts"],
        gate: true,
        needsStorefront: false,
        what: "every value the theme emits unescaped is classified",
    },
    {
        name: "competitive",
        command: "node",
        args: ["tools/competitive/verify.ts"],
        gate: true,
        needsStorefront: false,
        what: "the comparison declares its regime, its revisions and its approval state",
    },
    {
        name: "budgets-backed",
        command: "node",
        args: ["tools/perf/verify-budgets.ts"],
        gate: true,
        needsStorefront: false,
        what: "no performance ceiling stands without a measurement behind it",
    },
    {
        name: "seed",
        command: "pnpm",
        args: ["seed"],
        gate: true,
        needsStorefront: true,
        what: "the fixture the suite spends is put back",
    },
    {
        name: "registry",
        command: "node",
        args: ["tools/registry/verify.ts"],
        gate: true,
        needsStorefront: true,
        what: "the register and the suite agree in both directions",
    },
    {
        name: "suite",
        command: "npx",
        args: ["playwright", "test"],
        gate: true,
        needsStorefront: true,
        what: "every covered capability still behaves",
        dependsOn: "seed",
    },
];

export const unmetDependency = (check: Check, done: CheckResult[]): string | null => {
    if (!check.dependsOn) {
        return null;
    }
    const dependency = done.find((result) => result.name === check.dependsOn);
    if (!dependency || dependency.outcome === "passed") {
        return null;
    }
    return `${check.dependsOn} did not pass, and this check spends what it produces — a result here would say nothing`;
};

export const NO_STOREFRONT =
    "no storefront answered at the base URL, and this check has to drive one; run it against a seeded environment before reading anything into a green run";

export interface Tally {
    passed: number;
    failed: number;
    notExecuted: number;
    gatedFailures: string[];
}

export const tally = (results: CheckResult[]): Tally => ({
    passed: results.filter((result) => result.outcome === "passed").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    notExecuted: results.filter((result) => result.outcome === "not-executed").length,
    gatedFailures: results.filter((result) => result.gate && result.outcome === "failed").map((result) => result.name),
});

export const exitCode = (results: CheckResult[], mode: "informative" | "gate"): number => {
    if (mode === "informative") {
        return 0;
    }
    return tally(results).gatedFailures.length > 0 ? 1 : 0;
};

export const render = (results: CheckResult[]): string => {
    const counts = tally(results);
    const lines = results.map((result) => {
        const mark = result.outcome === "passed" ? "pass" : result.outcome === "failed" ? "FAIL" : "not run";
        const suffix = result.reason ? `\n         ${result.reason}` : "";
        return `  ${mark.padEnd(8)} ${result.name.padEnd(18)} ${result.gate ? "gate" : "info"}${suffix}`;
    });
    return [
        ...lines,
        "",
        `${counts.passed} passed · ${counts.failed} failed · ${counts.notExecuted} not executed`,
        counts.gatedFailures.length > 0 ? `gating checks that failed: ${counts.gatedFailures.join(", ")}` : "no gating check failed",
    ].join("\n");
};
