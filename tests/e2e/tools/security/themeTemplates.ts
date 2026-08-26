import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPhpPoints, extractPoints, type OutputPoint } from "./unescaped.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const THEME_ROOT = resolve(here, "../../../..");

export const PARENT_THEME_ROOT = resolve(THEME_ROOT, "../theme-base");

const SKIP = new Set(["web", "node_modules", "tests", ".git"]);

export const templateFiles = (root = THEME_ROOT): string[] => {
    const found: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory)) {
            if (SKIP.has(entry)) {
                continue;
            }
            const path = join(directory, entry);
            if (statSync(path).isDirectory()) {
                walk(path);
            } else if (entry.endsWith(".twig") || entry.endsWith(".phtml")) {
                found.push(path);
            }
        }
    };
    walk(root);
    return found.sort();
};

const pointsOf = (root: string, prefix: string): OutputPoint[] =>
    templateFiles(root).flatMap((path) => {
        const name = `${prefix}${relative(root, path)}`;
        const source = readFileSync(path, "utf8");
        return path.endsWith(".phtml") ? extractPhpPoints(name, source) : extractPoints(name, source);
    });

/**
 * A parent-theme template only reaches a page when this theme does not override
 * it, so the ones that are overridden are dropped rather than audited twice.
 */
export const liveTemplates = (): { file: string; root: string }[] => {
    const own = new Set(templateFiles(THEME_ROOT).map((path) => relative(THEME_ROOT, path).replace(/\.(twig|phtml)$/, "")));
    const files = templateFiles(THEME_ROOT).map((path) => ({ file: relative(THEME_ROOT, path), root: THEME_ROOT }));
    for (const path of templateFiles(PARENT_THEME_ROOT)) {
        const name = relative(PARENT_THEME_ROOT, path);
        if (!own.has(name.replace(/\.(twig|phtml)$/, ""))) {
            files.push({ file: `theme-base/${name}`, root: PARENT_THEME_ROOT });
        }
    }
    return files;
};

export const collectPoints = (root = THEME_ROOT): OutputPoint[] => {
    if (root !== THEME_ROOT) {
        return pointsOf(root, "");
    }
    const own = new Set(templateFiles(THEME_ROOT).map((path) => relative(THEME_ROOT, path).replace(/\.(twig|phtml)$/, "")));
    const inherited = pointsOf(PARENT_THEME_ROOT, "theme-base/").filter(
        (point) => !own.has(point.file.replace("theme-base/", "").replace(/\.(twig|phtml)$/, "")),
    );
    return [...pointsOf(THEME_ROOT, ""), ...inherited];
};
