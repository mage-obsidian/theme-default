import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { moduleNameFromDeclaration } from "./coreHandles.ts";
import type { ContractModules, DeclaredHandle } from "./crossReference.ts";

const LAYOUT_SEGMENTS = ["src/view/frontend/layout", "view/frontend/layout"];

export const readContract = (contractPath: string): ContractModules => {
    const parsed = JSON.parse(readFileSync(contractPath, "utf8"));
    return { optedIn: new Set(Object.keys(parsed.modules ?? {})) };
};

export const collectDeclaredHandles = (workspaceDirectory: string): DeclaredHandle[] => {
    const declared: DeclaredHandle[] = [];

    for (const entry of readdirSync(workspaceDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith("module-")) {
            continue;
        }
        const moduleDirectory = join(workspaceDirectory, entry.name);
        const layoutDirectory = LAYOUT_SEGMENTS.map((segment) => join(moduleDirectory, segment)).find((candidate) =>
            existsSync(candidate),
        );
        if (!layoutDirectory) {
            continue;
        }

        const declarationPath = [join(moduleDirectory, "src/etc/module.xml"), join(moduleDirectory, "etc/module.xml")].find(
            (candidate) => existsSync(candidate),
        );
        const module = declarationPath ? moduleNameFromDeclaration(readFileSync(declarationPath, "utf8")) : null;
        if (!module) {
            continue;
        }

        for (const file of readdirSync(layoutDirectory)) {
            if (file.endsWith(".xml")) {
                declared.push({ handle: file.replace(/\.xml$/, ""), module });
            }
        }
    }

    return declared.sort((a, b) => a.module.localeCompare(b.module) || a.handle.localeCompare(b.handle));
};
