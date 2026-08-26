export type Origin = "parity" | "performance" | "security" | "competitive";
export type Status = "covered" | "uncovered" | "blocked" | "out-of-scope" | "resolved";
export type Severity = "critical" | "major" | "minor" | "informational";
export type EvidenceRegime = "derived-from-code" | "declared-by-source";
export type ApprovalState = "not-approved" | "approved";

export type Platform = {
    distribution: string;
    version: string;
};

export type Evidence = {
    observation: string;
    confirmed?: boolean;
    regime?: EvidenceRegime;
    revisions?: Record<string, string>;
    source?: string;
    sourceVersion?: string;
    checkedAt?: string;
};

export type Approval = {
    state: ApprovalState;
    decidedAt?: string;
};

export type RegistryEntry = {
    id: string;
    capability: string;
    origin: Origin;
    status: Status;
    severity: Severity;
    evidence: Evidence;
    platform?: Platform;
    handles?: string[];
    tests?: string[];
    reason?: string;
    unblockedBy?: string;
    approval?: Approval;
    resolvedBy?: string;
    capabilityTag?: string;
};

export type Violation = {
    id: string;
    rule: string;
    detail: string;
};

const REQUIRES_REASON: Status[] = ["uncovered", "blocked", "out-of-scope"];

const violation = (id: string, rule: string, detail: string): Violation => ({ id, rule, detail });

export const validateEntry = (entry: RegistryEntry): Violation[] => {
    const problems: Violation[] = [];

    if (!entry.evidence || !entry.evidence.observation?.trim()) {
        problems.push(violation(entry.id, "evidence-required", "an entry must name the observation that supports it"));
    }

    if (entry.status === "covered" && (entry.tests ?? []).length === 0) {
        problems.push(violation(entry.id, "covered-needs-test", "a covered entry must name at least one test"));
    }

    if (REQUIRES_REASON.includes(entry.status) && !entry.reason?.trim()) {
        problems.push(violation(entry.id, "reason-required", `status "${entry.status}" must explain itself`));
    }

    if (entry.status === "blocked" && !entry.unblockedBy?.trim()) {
        problems.push(violation(entry.id, "unblock-condition-required", "a blocked entry must name what unblocks it"));
    }

    if (entry.status === "resolved" && !entry.resolvedBy?.trim()) {
        problems.push(violation(entry.id, "resolution-evidence-required", "a resolved entry must name the verification that proves it"));
    }

    if (entry.origin === "parity" && entry.status === "covered" && !entry.platform) {
        problems.push(violation(entry.id, "platform-required", "a parity claim must declare the platform it was verified on"));
    }

    if (entry.origin === "performance") {
        problems.push(...validatePerformance(entry));
    }

    if (entry.origin === "competitive") {
        problems.push(...validateCompetitive(entry));
    }

    return problems;
};

const validatePerformance = (entry: RegistryEntry): Violation[] => {
    const problems: Violation[] = [];

    if (typeof entry.evidence?.confirmed !== "boolean") {
        problems.push(
            violation(
                entry.id,
                "attribution-confirmation-required",
                "a performance claim must say whether its attribution was confirmed by instrumenting the code it blames",
            ),
        );
        return problems;
    }

    if (entry.evidence.confirmed === false && !entry.reason?.trim()) {
        problems.push(
            violation(
                entry.id,
                "confirmation-path-required",
                "an unconfirmed attribution must name the instrumentation that would settle it",
            ),
        );
    }

    return problems;
};

const validateCompetitive = (entry: RegistryEntry): Violation[] => {
    const problems: Violation[] = [];
    const regime = entry.evidence?.regime;

    if (!regime) {
        problems.push(violation(entry.id, "evidence-regime-required", "a competitive claim must declare its evidence regime or be marked unverified"));
        return problems;
    }

    if (regime === "derived-from-code" && Object.keys(entry.evidence.revisions ?? {}).length < 2) {
        problems.push(violation(entry.id, "revisions-required", "a claim derived from code must pin the revision of each side"));
    }

    if (regime === "declared-by-source" && !(entry.evidence.source?.trim() && entry.evidence.sourceVersion?.trim())) {
        problems.push(violation(entry.id, "source-required", "a claim declared by its source must cite the source and the product version"));
    }

    if (!entry.approval) {
        problems.push(violation(entry.id, "approval-required", "a competitive entry must carry an approval state"));
    } else if (entry.approval.state === "approved" && !entry.approval.decidedAt?.trim()) {
        problems.push(violation(entry.id, "approval-date-required", "an approved entry must record when it was decided"));
    }

    return problems;
};

export const validateRegistry = (entries: RegistryEntry[]): Violation[] => {
    const problems: Violation[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
        if (seen.has(entry.id)) {
            problems.push(violation(entry.id, "duplicate-id", "entry ids must be unique"));
        }
        seen.add(entry.id);
        problems.push(...validateEntry(entry));
    }

    return problems;
};

export const isApprovedForWork = (entry: RegistryEntry): boolean =>
    entry.origin !== "competitive" || entry.approval?.state === "approved";
