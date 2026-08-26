import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { TemplateFile } from "./themeTree.ts";

const walk = (directory: string, matches: (name: string) => boolean): string[] => {
    if (!existsSync(directory)) {
        return [];
    }
    const found: string[] = [];
    for (const entry of readdirSync(directory)) {
        if (entry === ".git" || entry === "node_modules" || entry === "tests") {
            continue;
        }
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            found.push(...walk(path, matches));
        } else if (matches(entry)) {
            found.push(path);
        }
    }
    return found;
};

const TEMPLATE = (name: string): boolean => name.endsWith(".phtml") || name.endsWith(".twig");

/** A theme root: one directory per `Vendor_Module`, each with `templates/` below it. */
export const fromThemeRoot = (root: string): TemplateFile[] => {
    if (!existsSync(root)) {
        return [];
    }
    const files: TemplateFile[] = [];
    for (const entry of readdirSync(root)) {
        if (!entry.includes("_") || !statSync(join(root, entry)).isDirectory()) {
            continue;
        }
        const templates = join(root, entry, "templates");
        for (const path of walk(templates, TEMPLATE)) {
            files.push({ module: entry, path: relative(templates, path) });
        }
    }
    return files;
};

const moduleNameOf = (root: string): string | null => {
    const registration = join(root, "src", "registration.php");
    const alternative = join(root, "registration.php");
    for (const candidate of [registration, alternative]) {
        if (existsSync(candidate)) {
            const match = readFileSync(candidate, "utf8").match(/['"]([A-Za-z0-9]+_[A-Za-z0-9]+)['"]/);
            if (match) {
                return match[1];
            }
        }
    }
    return null;
};

/** A module root: templates live under `src/view/frontend/templates` or `view/frontend/templates`. */
export const fromModuleRoot = (root: string, fallbackName?: string): TemplateFile[] => {
    const module = moduleNameOf(root) ?? fallbackName ?? basename(root);
    const candidates = [join(root, "src", "view", "frontend", "templates"), join(root, "view", "frontend", "templates")];
    const files: TemplateFile[] = [];
    for (const templates of candidates) {
        for (const path of walk(templates, TEMPLATE)) {
            files.push({ module, path: relative(templates, path) });
        }
    }
    return files;
};

/**
 * A MageObsidian storefront module keeps its templates under the core module it
 * replaces, so `module-catalog` contributes to `Magento_Catalog`, not to a module
 * of its own name.
 */
export const fromStorefrontModule = (root: string): TemplateFile[] => {
    const candidates = [join(root, "src", "view", "frontend", "templates"), join(root, "view", "frontend", "templates")];
    const files: TemplateFile[] = [];
    for (const templates of candidates) {
        if (!existsSync(templates)) {
            continue;
        }
        for (const entry of readdirSync(templates)) {
            const path = join(templates, entry);
            if (!statSync(path).isDirectory() || !entry.includes("_")) {
                continue;
            }
            for (const file of walk(path, TEMPLATE)) {
                files.push({ module: entry, path: relative(path, file) });
            }
        }
    }
    return files;
};
