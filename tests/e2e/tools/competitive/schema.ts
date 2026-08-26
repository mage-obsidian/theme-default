export type ComparisonState = "gap" | "equivalent-by-another-path" | "discarded-by-architecture";
export type Regime = "derived-from-code" | "declared-by-source";
export type ApprovalState = "not-approved" | "approved";
export type MigrationVerdict = "equivalent" | "rewrite" | "no-equivalent" | "loss";

export interface Capability {
    id: string;
    capability: string;
    referenceModule: string;
    referenceTemplates: number;
    state: ComparisonState;
    regime: Regime;
    evidence: string;
    revisions?: Record<string, string>;
    source?: string;
    sourceVersion?: string;
    ourPath?: string;
    gapId?: string;
}

export interface BacklogItem {
    id: string;
    title: string;
    capabilityId: string;
    priority: number;
    effort: "small" | "medium" | "large";
    criteria: string[];
    dependsOn: string[];
    approval: { state: ApprovalState; decidedAt?: string };
    reimplementFromBehaviour: boolean;
    derivedFrom: Regime;
}

export interface MigrationItem {
    id: string;
    subject: string;
    verdict: MigrationVerdict;
    assumption: string;
    detail: string;
    gapId?: string;
}

export interface Problem {
    id: string;
    rule: string;
    detail: string;
}

const problem = (id: string, rule: string, detail: string): Problem => ({ id, rule, detail });

const STATES: ComparisonState[] = ["gap", "equivalent-by-another-path", "discarded-by-architecture"];

export const validateCapability = (entry: Capability): Problem[] => {
    const problems: Problem[] = [];

    if (!STATES.includes(entry.state)) {
        problems.push(problem(entry.id, "state-required", "a comparison must land on gap, equivalence or a discarded decision"));
    }
    if (entry.regime !== "derived-from-code" && entry.regime !== "declared-by-source") {
        problems.push(problem(entry.id, "regime-required", "a comparison must declare how it knows what it claims"));
        return problems;
    }
    if (!entry.evidence?.trim()) {
        problems.push(problem(entry.id, "evidence-required", "a comparison must name what was observed"));
    }
    if (entry.regime === "derived-from-code" && Object.keys(entry.revisions ?? {}).length < 1) {
        problems.push(problem(entry.id, "revisions-required", "a claim derived from code must pin the revision it was derived from"));
    }
    if (entry.regime === "declared-by-source" && !(entry.source?.trim() && entry.sourceVersion?.trim())) {
        problems.push(problem(entry.id, "source-required", "a claim declared by its source must cite the source and the product version"));
    }
    if (entry.state === "equivalent-by-another-path" && !entry.ourPath?.trim()) {
        problems.push(problem(entry.id, "our-path-required", "an equivalence must say where our path is"));
    }
    if (entry.state === "gap" && !entry.gapId?.trim()) {
        problems.push(problem(entry.id, "gap-entry-required", "a gap must point at the register entry that carries it"));
    }

    return problems;
};

export const validateBacklogItem = (item: BacklogItem, capabilities: Capability[]): Problem[] => {
    const problems: Problem[] = [];

    if (!item.approval) {
        problems.push(problem(item.id, "approval-required", "a backlog item must carry an approval state"));
    } else {
        if (item.approval.state !== "approved" && item.approval.state !== "not-approved") {
            problems.push(problem(item.id, "approval-required", "an approval state is either approved or not-approved"));
        }
        if (item.approval.state === "approved" && !item.approval.decidedAt?.trim()) {
            problems.push(problem(item.id, "approval-date-required", "an approved item must record when it was decided"));
        }
    }
    if (!capabilities.some((candidate) => candidate.id === item.capabilityId)) {
        problems.push(problem(item.id, "capability-required", `no comparison entry called "${item.capabilityId}"`));
    }
    if ((item.criteria ?? []).length === 0) {
        problems.push(problem(item.id, "criteria-required", "the criteria that put this item where it is must be written down"));
    }
    if (item.derivedFrom === "derived-from-code" && !item.reimplementFromBehaviour) {
        problems.push(
            problem(
                item.id,
                "reimplementation-required",
                "the reference is OSL-3.0 and this project is MIT, so anything derived from its code has to be rebuilt from observable behaviour",
            ),
        );
    }
    for (const dependency of item.dependsOn ?? []) {
        if (dependency === item.id) {
            problems.push(problem(item.id, "self-dependency", "an item cannot depend on itself"));
        }
    }

    return problems;
};

export const validateMigrationItem = (item: MigrationItem): Problem[] => {
    const problems: Problem[] = [];
    const verdicts: MigrationVerdict[] = ["equivalent", "rewrite", "no-equivalent", "loss"];

    if (!verdicts.includes(item.verdict)) {
        problems.push(problem(item.id, "verdict-required", "every subject must be classified"));
    }
    if (!item.assumption?.trim()) {
        problems.push(problem(item.id, "assumption-required", "a migration claim must declare what it assumes about the store being moved"));
    }
    if (item.verdict === "no-equivalent" && !item.gapId?.trim()) {
        problems.push(problem(item.id, "gap-link-required", "what has no equivalent must link to the gap entry that carries it"));
    }

    return problems;
};

export const mayStartWork = (item: BacklogItem): boolean => item.approval?.state === "approved";

export const blockedReason = (item: BacklogItem): string | null =>
    mayStartWork(item)
        ? null
        : `${item.id} is not approved: detecting a gap does not authorise incorporating anything into MageObsidian`;
