import { createHash } from "node:crypto";

export type EmissionContext = "text" | "attribute" | "tag" | "script" | "style";

export interface OutputPoint {
    file: string;
    line: number;
    expression: string;
    context: EmissionContext;
    fingerprint: string;
}

const RAW = /\|\s*raw\b/g;

export const normaliseExpression = (expression: string): string =>
    expression
        .replace(/\s+/g, " ")
        .replace(/'(?:[^']|\\')*'/g, "'...'")
        .replace(/"(?:[^"]|\\")*"/g, '"..."')
        .trim();

const lastIndexOf = (haystack: string, pattern: RegExp): number => {
    let found = -1;
    const search = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = search.exec(haystack)) !== null) {
        found = match.index;
    }
    return found;
};

export const contextAt = (source: string, offset: number): EmissionContext => {
    const before = source.slice(0, offset);
    const inside = (open: RegExp, close: RegExp): boolean => lastIndexOf(before, open) > lastIndexOf(before, close);

    if (inside(/<script\b/gi, /<\/script>/gi)) {
        return "script";
    }
    if (inside(/<style\b/gi, /<\/style>/gi)) {
        return "style";
    }

    const lastLt = before.lastIndexOf("<");
    const lastGt = before.lastIndexOf(">");
    if (lastLt <= lastGt) {
        return "text";
    }

    const tag = before.slice(lastLt);
    const quotes = (tag.match(/"/g) ?? []).length + (tag.match(/'/g) ?? []).length;
    return quotes % 2 === 1 ? "attribute" : "tag";
};

export const fingerprint = (file: string, expression: string, context: EmissionContext): string =>
    createHash("sha1").update(`${file} ${expression} ${context}`).digest("hex").slice(0, 12);

export type EnclosureKind = "output" | "statement" | "comment";

export interface Enclosure {
    kind: EnclosureKind;
    start: number;
    body: string;
}

const OPENERS: { token: string; kind: EnclosureKind; close: string }[] = [
    { token: "{{", kind: "output", close: "}}" },
    { token: "{%", kind: "statement", close: "%}" },
    { token: "{#", kind: "comment", close: "#}" },
];

export const inComment = (source: string, offset: number): boolean =>
    source.lastIndexOf("{#", offset) > source.lastIndexOf("#}", offset);

export const enclosing = (source: string, offset: number): Enclosure | null => {
    if (inComment(source, offset)) {
        return { kind: "comment", start: source.lastIndexOf("{#", offset), body: "" };
    }
    let best: { token: string; kind: EnclosureKind; close: string; start: number } | null = null;
    for (const opener of OPENERS) {
        const start = source.lastIndexOf(opener.token, offset);
        if (start !== -1 && (best === null || start > best.start)) {
            best = { ...opener, start };
        }
    }
    if (best === null) {
        return null;
    }
    const end = source.indexOf(best.close, best.start + 2);
    if (end !== -1 && end < offset) {
        return null;
    }
    const body = source.slice(best.start + 2, end === -1 ? offset : end);
    return { kind: best.kind, start: best.start, body };
};

const stripRaw = (body: string): string =>
    normaliseExpression(body.replace(/\|\s*raw\b/, " ").replace(/\s*\|\s*$/, ""));

export const extractPoints = (file: string, source: string): OutputPoint[] => {
    const points: OutputPoint[] = [];
    RAW.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RAW.exec(source)) !== null) {
        const enclosure = enclosing(source, match.index);
        if (enclosure === null || enclosure.kind === "comment") {
            continue;
        }
        const context = contextAt(source, enclosure.start);
        const expression = stripRaw(enclosure.body);
        points.push({
            file,
            line: source.slice(0, match.index).split("\n").length,
            expression,
            context,
            fingerprint: fingerprint(file, expression, context),
        });
    }
    return points;
};

const ECHO = /<\?=(.*?)\?>/gs;
const ESCAPED = /^\s*\$(escaper|block|this)\s*->\s*escape[A-Za-z]+\s*\(/;
const NO_ESCAPE = /@noEscape|@escapeNotVerified/;

export const extractPhpPoints = (file: string, source: string): OutputPoint[] => {
    const points: OutputPoint[] = [];
    ECHO.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ECHO.exec(source)) !== null) {
        const body = match[1];
        const withoutComments = body.replace(/\/\*.*?\*\//gs, " ");
        if (ESCAPED.test(withoutComments) && !NO_ESCAPE.test(body)) {
            continue;
        }
        const context = contextAt(source, match.index);
        const expression = normaliseExpression(withoutComments);
        points.push({
            file,
            line: source.slice(0, match.index).split("\n").length,
            expression,
            context,
            fingerprint: fingerprint(file, expression, context),
        });
    }
    return points;
};

export type ValueOrigin = "core-block" | "theme-helper" | "store-config" | "cms-content" | "user-input";

export interface Defect {
    severity: "critical" | "major" | "minor";
    detail: string;
}

export interface Classification {
    fingerprint: string;
    file: string;
    expression: string;
    context: EmissionContext;
    origin: ValueOrigin;
    reason: string;
    guarantee?: string;
    defect?: Defect;
}

export interface Finding {
    rule: string;
    fingerprint: string;
    detail: string;
}

export const audit = (points: OutputPoint[], classified: Classification[]): Finding[] => {
    const byFingerprint = new Map(classified.map((entry) => [entry.fingerprint, entry]));
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const point of points) {
        seen.add(point.fingerprint);
        const entry = byFingerprint.get(point.fingerprint);
        if (!entry) {
            findings.push({
                rule: "unclassified",
                fingerprint: point.fingerprint,
                detail: `${point.file}:${point.line} emits "${point.expression}" unescaped in ${point.context} context with no entry saying why that is safe`,
            });
            continue;
        }
        if (entry.defect) {
            findings.push({
                rule: "known-defect",
                fingerprint: point.fingerprint,
                detail: `${point.file}:${point.line} (${entry.defect.severity}) ${entry.defect.detail}`,
            });
            continue;
        }
        if (entry.origin === "user-input" && !entry.guarantee?.trim()) {
            findings.push({
                rule: "user-input-unescaped",
                fingerprint: point.fingerprint,
                detail: `${point.file}:${point.line} emits end-user content unescaped with no declared guarantee that it was escaped upstream`,
            });
        }
    }

    for (const entry of classified) {
        if (!seen.has(entry.fingerprint)) {
            findings.push({
                rule: "stale-classification",
                fingerprint: entry.fingerprint,
                detail: `${entry.file} no longer emits "${entry.expression}" unescaped in ${entry.context} context, so the classification anchored to it cannot be trusted`,
            });
        }
    }

    return findings;
};

export interface ExpressionGroup {
    expression: string;
    count: number;
    contexts: string[];
    files: string[];
}

export const groupByExpression = (points: OutputPoint[]): ExpressionGroup[] => {
    const groups = new Map<string, { expression: string; count: number; contexts: Set<string>; files: Set<string> }>();
    for (const point of points) {
        const existing =
            groups.get(point.expression) ??
            { expression: point.expression, count: 0, contexts: new Set<string>(), files: new Set<string>() };
        existing.count += 1;
        existing.contexts.add(point.context);
        existing.files.add(point.file);
        groups.set(point.expression, existing);
    }
    return [...groups.values()]
        .map((group) => ({
            expression: group.expression,
            count: group.count,
            contexts: [...group.contexts].sort(),
            files: [...group.files].sort(),
        }))
        .sort((a, b) => b.count - a.count);
};
