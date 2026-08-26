import type { CoreHandle } from "./coreHandles.ts";

export type ParityStatus = "declared" | "declared-not-installed" | "suppressed" | "untouched";

export type DeclaredHandle = {
    handle: string;
    module: string;
};

export type ParityEntry = {
    handle: string;
    coreModule: string;
    status: ParityStatus;
    declaredBy: string[];
};

export type ContractModules = {
    optedIn: Set<string>;
};

export const crossReference = (
    coreHandles: CoreHandle[],
    declared: DeclaredHandle[],
    contract: ContractModules,
): ParityEntry[] => {
    const declaredBy = new Map<string, string[]>();
    const dormantBy = new Map<string, string[]>();

    for (const entry of declared) {
        const target = contract.optedIn.has(entry.module) ? declaredBy : dormantBy;
        const owners = target.get(entry.handle) ?? [];
        if (!owners.includes(entry.module)) {
            owners.push(entry.module);
        }
        target.set(entry.handle, owners);
    }

    return coreHandles.map((core) => {
        const owners = (declaredBy.get(core.handle) ?? []).slice().sort();
        if (owners.length > 0) {
            return { handle: core.handle, coreModule: core.module, status: "declared", declaredBy: owners };
        }

        const dormant = (dormantBy.get(core.handle) ?? []).slice().sort();
        if (dormant.length > 0) {
            return { handle: core.handle, coreModule: core.module, status: "declared-not-installed", declaredBy: dormant };
        }
        const status: ParityStatus = contract.optedIn.has(core.module) ? "untouched" : "suppressed";
        return { handle: core.handle, coreModule: core.module, status, declaredBy: [] };
    });
};

export const orphanDeclarations = (coreHandles: CoreHandle[], declared: DeclaredHandle[]): DeclaredHandle[] => {
    const known = new Set(coreHandles.map((entry) => entry.handle));
    return declared.filter((entry) => !known.has(entry.handle));
};

export const summarise = (entries: ParityEntry[]): Record<ParityStatus, number> => {
    const totals: Record<ParityStatus, number> = { declared: 0, "declared-not-installed": 0, suppressed: 0, untouched: 0 };
    for (const entry of entries) {
        totals[entry.status] += 1;
    }
    return totals;
};

export const byCoreModule = (entries: ParityEntry[]): Map<string, ParityEntry[]> => {
    const grouped = new Map<string, ParityEntry[]>();
    for (const entry of entries) {
        const bucket = grouped.get(entry.coreModule) ?? [];
        bucket.push(entry);
        grouped.set(entry.coreModule, bucket);
    }
    return grouped;
};
