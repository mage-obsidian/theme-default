import type { RegistryEntry, Severity, Status } from "./schema.ts";

export type ClassificationRule = {
    match: string[];
    status: Status;
    severity: Severity;
    reason: string;
    unblockedBy?: string;
};

export const applyClassification = (entries: RegistryEntry[], rules: ClassificationRule[]): RegistryEntry[] => {
    const byHandle = new Map<string, ClassificationRule>();
    for (const rule of rules) {
        for (const handle of rule.match) {
            byHandle.set(handle, rule);
        }
    }

    return entries.map((entry) => {
        const handle = entry.handles?.[0];
        const rule = handle ? byHandle.get(handle) : undefined;
        const isSuppressed = entry.evidence.observation.includes("not re-declared");
        if (!rule || !isSuppressed || entry.status === "covered") {
            return entry;
        }

        const classified: RegistryEntry = { ...entry, status: rule.status, severity: rule.severity, reason: rule.reason };
        if (rule.unblockedBy) {
            classified.unblockedBy = rule.unblockedBy;
        }
        return classified;
    });
};

export const unclassifiedSuppressed = (entries: RegistryEntry[]): RegistryEntry[] =>
    entries.filter(
        (entry) =>
            entry.evidence.observation.includes("not re-declared") &&
            entry.status === "uncovered" &&
            !(entry.reason ?? "").includes("gap candidate"),
    );
