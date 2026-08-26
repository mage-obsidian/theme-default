export interface ProposedChange {
    order: number;
    name: string;
    why: string;
    motivatedBy: string[];
    kind: "defect" | "coverage" | "hardening" | "performance" | "gap" | "environment";
    needsApprovalFirst: boolean;
}

export interface RemediationProblem {
    name: string;
    rule: string;
    detail: string;
}

/**
 * A motivation resolves either to an entry id or to a track prefix, because some
 * changes answer a whole track rather than one capability.
 */
export const resolves = (motivation: string, ids: Set<string>): boolean =>
    ids.has(motivation) || [...ids].some((id) => id.startsWith(`${motivation}/`));

export const validateRemediation = (
    changes: ProposedChange[],
    entryIds: Set<string>,
    approvedBacklog: Set<string>,
    backlogFor: Map<string, string>,
): RemediationProblem[] => {
    const problems: RemediationProblem[] = [];
    const orders = new Set<number>();

    for (const change of changes) {
        if (orders.has(change.order)) {
            problems.push({ name: change.name, rule: "duplicate-order", detail: `two changes claim position ${change.order}` });
        }
        orders.add(change.order);

        if ((change.motivatedBy ?? []).length === 0) {
            problems.push({ name: change.name, rule: "motivation-required", detail: "a proposed change must name what motivates it" });
        }

        for (const motivation of change.motivatedBy ?? []) {
            if (!resolves(motivation, entryIds)) {
                problems.push({
                    name: change.name,
                    rule: "unknown-motivation",
                    detail: `"${motivation}" matches no register entry`,
                });
            }
        }

        if (change.needsApprovalFirst) {
            for (const motivation of change.motivatedBy ?? []) {
                const item = backlogFor.get(motivation);
                if (item && approvedBacklog.has(item)) {
                    continue;
                }
            }
        } else if (change.kind === "gap") {
            problems.push({
                name: change.name,
                rule: "approval-flag-required",
                detail: "a change that closes a competitive gap cannot start before its backlog item is approved",
            });
        }
    }

    return problems;
};

export const startable = (change: ProposedChange, approvedBacklog: Set<string>, backlogFor: Map<string, string>): boolean => {
    if (!change.needsApprovalFirst) {
        return true;
    }
    return (change.motivatedBy ?? []).every((motivation) => {
        const item = backlogFor.get(motivation);
        return item !== undefined && approvedBacklog.has(item);
    });
};
