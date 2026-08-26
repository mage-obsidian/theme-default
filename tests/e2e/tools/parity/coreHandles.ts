export type HandleOrigin = "layout-file" | "handle-reference";

export type CoreHandle = {
    handle: string;
    module: string;
    origin: HandleOrigin;
};

export type ModuleLayouts = {
    module: string;
    directory: string;
    files: string[];
};

export interface LayoutSource {
    listModuleDirectories(): string[];
    readModuleName(moduleDirectory: string): string | null;
    listLayoutFiles(moduleDirectory: string, area: string): string[];
    readFile(path: string): string;
}

const HANDLE_REFERENCE = /<update\s+handle\s*=\s*"([^"]+)"/g;

export const handleFromLayoutFile = (filePath: string): string => {
    const name = filePath.split("/").pop() ?? filePath;
    return name.replace(/\.xml$/, "");
};

export const referencedHandles = (xml: string): string[] => {
    const found = new Set<string>();
    for (const match of xml.matchAll(HANDLE_REFERENCE)) {
        found.add(match[1]);
    }
    return [...found].sort();
};

export const moduleNameFromDeclaration = (moduleXml: string): string | null => {
    const match = moduleXml.match(/<module\s+name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
};

export const moduleNameFromDirectory = (directory: string): string => {
    const name = (directory.split("/").pop() ?? directory).replace(/^module-/, "");
    const pascal = name
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
    return `Magento_${pascal}`;
};

export const collectCoreHandles = (source: LayoutSource, area = "frontend"): CoreHandle[] => {
    const handles: CoreHandle[] = [];
    const seen = new Set<string>();

    for (const directory of source.listModuleDirectories()) {
        const files = source.listLayoutFiles(directory, area);
        if (files.length === 0) {
            continue;
        }
        const module = source.readModuleName(directory) ?? moduleNameFromDirectory(directory);

        for (const file of files) {
            const handle = handleFromLayoutFile(file);
            const key = `${module}::${handle}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            handles.push({ handle, module, origin: "layout-file" });
        }

        for (const file of files) {
            for (const handle of referencedHandles(source.readFile(file))) {
                const key = `${module}::${handle}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                handles.push({ handle, module, origin: "handle-reference" });
            }
        }
    }

    return handles.sort((a, b) => a.module.localeCompare(b.module) || a.handle.localeCompare(b.handle));
};

export const countByModule = (handles: CoreHandle[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const handle of handles) {
        counts.set(handle.module, (counts.get(handle.module) ?? 0) + 1);
    }
    return counts;
};
