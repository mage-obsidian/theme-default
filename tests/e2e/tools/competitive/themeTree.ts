export interface TemplateFile {
    module: string;
    path: string;
}

export interface FileSource {
    /** Every template file the side ships, as `Vendor_Module` plus a path below `templates/`. */
    list(): TemplateFile[];
}

export interface ModuleSurface {
    module: string;
    templates: string[];
}

export const surfaceOf = (files: TemplateFile[]): ModuleSurface[] => {
    const byModule = new Map<string, Set<string>>();
    for (const file of files) {
        const set = byModule.get(file.module) ?? new Set<string>();
        set.add(file.path);
        byModule.set(file.module, set);
    }
    return [...byModule.entries()]
        .map(([module, templates]) => ({ module, templates: [...templates].sort() }))
        .sort((a, b) => a.module.localeCompare(b.module));
};

export type ModuleVerdict = "both" | "reference-only" | "ours-only";

export interface ModuleComparison {
    module: string;
    verdict: ModuleVerdict;
    referenceTemplates: number;
    ourTemplates: number;
    onlyInReference: string[];
    onlyInOurs: string[];
    shared: string[];
}

export const compareSurfaces = (reference: ModuleSurface[], ours: ModuleSurface[]): ModuleComparison[] => {
    const referenceByModule = new Map(reference.map((entry) => [entry.module, new Set(entry.templates)]));
    const oursByModule = new Map(ours.map((entry) => [entry.module, new Set(entry.templates)]));
    const modules = [...new Set([...referenceByModule.keys(), ...oursByModule.keys()])].sort();

    return modules.map((module) => {
        const theirs = referenceByModule.get(module) ?? new Set<string>();
        const mine = oursByModule.get(module) ?? new Set<string>();
        const verdict: ModuleVerdict =
            theirs.size > 0 && mine.size > 0 ? "both" : theirs.size > 0 ? "reference-only" : "ours-only";

        return {
            module,
            verdict,
            referenceTemplates: theirs.size,
            ourTemplates: mine.size,
            onlyInReference: [...theirs].filter((path) => !mine.has(path)).sort(),
            onlyInOurs: [...mine].filter((path) => !theirs.has(path)).sort(),
            shared: [...theirs].filter((path) => mine.has(path)).sort(),
        };
    });
};

/**
 * Two themes written for different engines never share a file extension, and one
 * of them splits a page into more partials than the other. Comparing raw paths
 * would report every file as unique, so paths are reduced to the part that
 * carries meaning: the directory chain and the stem.
 */
export const normalisePath = (path: string): string =>
    path
        .replace(/\.(phtml|twig|html)$/i, "")
        .replace(/[_-]/g, "")
        .toLowerCase();

export const normaliseSurface = (surface: ModuleSurface[]): ModuleSurface[] =>
    surface.map((entry) => ({
        module: entry.module,
        templates: [...new Set(entry.templates.map(normalisePath))].sort(),
    }));

export const summarise = (comparisons: ModuleComparison[]): Record<ModuleVerdict, number> => ({
    both: comparisons.filter((entry) => entry.verdict === "both").length,
    "reference-only": comparisons.filter((entry) => entry.verdict === "reference-only").length,
    "ours-only": comparisons.filter((entry) => entry.verdict === "ours-only").length,
});
