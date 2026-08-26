export type Outcome = "passed" | "failed" | "not-executed";

export interface Annotation {
    type: string;
    description?: string;
}

export interface Verdict {
    outcome: Outcome;
    reason: string | null;
}

const FAILED = new Set(["failed", "timedOut", "interrupted"]);

export const NO_REASON = "skipped without saying why — a check that cannot say what it could not observe is worse than none";

export const classifyOutcome = (status: string, annotations: Annotation[] = []): Verdict => {
    if (status === "passed") {
        return { outcome: "passed", reason: null };
    }
    if (FAILED.has(status)) {
        return { outcome: "failed", reason: null };
    }
    const skip = annotations.find((annotation) => annotation.type === "skip" || annotation.type === "fixme");
    const reason = skip?.description?.trim();
    return { outcome: "not-executed", reason: reason && reason !== "" ? reason : NO_REASON };
};

export interface Tally {
    passed: number;
    failed: number;
    notExecuted: number;
}

export const tally = (verdicts: Verdict[]): Tally => ({
    passed: verdicts.filter((verdict) => verdict.outcome === "passed").length,
    failed: verdicts.filter((verdict) => verdict.outcome === "failed").length,
    notExecuted: verdicts.filter((verdict) => verdict.outcome === "not-executed").length,
});
