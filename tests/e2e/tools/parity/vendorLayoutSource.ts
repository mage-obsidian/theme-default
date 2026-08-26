import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { moduleNameFromDeclaration, type LayoutSource } from "./coreHandles.ts";

export const vendorLayoutSource = (vendorDirectory: string): LayoutSource => ({
    listModuleDirectories: () =>
        readdirSync(vendorDirectory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name.startsWith("module-"))
            .map((entry) => join(vendorDirectory, entry.name))
            .sort(),

    readModuleName: (moduleDirectory) => {
        const declaration = join(moduleDirectory, "etc", "module.xml");
        if (!existsSync(declaration)) {
            return null;
        }
        return moduleNameFromDeclaration(readFileSync(declaration, "utf8"));
    },

    listLayoutFiles: (moduleDirectory, area) => {
        const directory = join(moduleDirectory, "view", area, "layout");
        if (!existsSync(directory)) {
            return [];
        }
        return readdirSync(directory)
            .filter((name) => name.endsWith(".xml"))
            .map((name) => join(directory, name))
            .sort();
    },

    readFile: (path) => readFileSync(path, "utf8"),
});
