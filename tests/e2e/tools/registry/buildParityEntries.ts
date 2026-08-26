import type { ParityEntry } from "../parity/crossReference.ts";
import type { Platform, RegistryEntry, Severity, Status } from "./schema.ts";

export type CoverageMap = Map<string, string[]>;

export type Classification = {
    status: Status;
    severity: Severity;
    reason?: string;
    unblockedBy?: string;
};

const RENDERERS = /_renderers$/;

export const entryId = (entry: ParityEntry): string =>
    `parity/${entry.coreModule.toLowerCase().replace(/_/g, "-")}/${entry.handle}`;

export const classify = (entry: ParityEntry, coveringTests: string[]): Classification => {
    if (coveringTests.length > 0) {
        return { status: "covered", severity: "informational" };
    }
    if (entry.status === "declared") {
        return { status: "uncovered", severity: "major", reason: "re-declared by MageObsidian but no test exercises it" };
    }
    if (entry.status === "declared-not-installed") {
        return {
            status: "blocked",
            severity: "major",
            reason: "re-declared by a MageObsidian module this platform does not carry, so the core contribution is suppressed and nothing replaces it",
            unblockedBy: `installing and enabling ${entry.declaredBy.join(", ")} on this platform, then regenerating the contract`,
        };
    }
    if (RENDERERS.test(entry.handle)) {
        return {
            status: "out-of-scope",
            severity: "informational",
            reason: "renderer declaration, not a screen: it contributes item renderers to another handle",
        };
    }
    return { status: "uncovered", severity: "major", reason: "core handle neither re-declared nor covered by a test" };
};

export const buildParityEntries = (
    parity: ParityEntry[],
    coverage: CoverageMap,
    platform: Platform,
): RegistryEntry[] =>
    parity.map((entry) => {
        const id = entryId(entry);
        const tests = coverage.get(id) ?? [];
        const classification = classify(entry, tests);

        const built: RegistryEntry = {
            id,
            capability: `${entry.coreModule}: ${entry.handle}`,
            origin: "parity",
            status: classification.status,
            severity: classification.severity,
            handles: [entry.handle],
            evidence: {
                observation:
                    entry.status === "declared"
                        ? `handle re-declared by ${entry.declaredBy.join(", ")}`
                        : entry.status === "declared-not-installed"
                          ? `handle re-declared by ${entry.declaredBy.join(", ")}, which the contract does not carry on this platform`
                          : "handle present in the core layout set and not re-declared by any MageObsidian module",
                confirmed: true,
            },
        };

        if (tests.length > 0) {
            built.tests = tests;
            built.platform = platform;
        }
        if (classification.reason) {
            built.reason = classification.reason;
        }
        if (classification.unblockedBy) {
            built.unblockedBy = classification.unblockedBy;
        }
        return built;
    });
