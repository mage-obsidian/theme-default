export interface Frame {
    depth: number;
    call: string;
    file: string;
    line: number;
}

export interface QueryBlock {
    seq: number;
    kind: string;
    sql: string;
    timeMs: number;
    frames: Frame[];
    entry: string;
}

const BLOCK = /^## \d{4}-\d{2}-\d{2} /;
const HEADER = /^## (\d+) ## (\w+)/;
const FRAME = /^#(\d+) (.+?) called at \[(.+?):(\d+)\]\s*$/;

export const parseQueryLog = (raw: string): QueryBlock[] => {
    const blocks: QueryBlock[] = [];
    let current: string[] = [];

    const flush = () => {
        if (current.length > 0) {
            const block = parseBlock(current);
            if (block) {
                blocks.push(block);
            }
        }
        current = [];
    };

    for (const line of raw.split("\n")) {
        if (BLOCK.test(line)) {
            flush();
            continue;
        }
        current.push(line);
    }
    flush();
    return blocks;
};

const parseBlock = (lines: string[]): QueryBlock | null => {
    const header = lines.find((line) => HEADER.test(line));
    if (!header) {
        return null;
    }
    const [, seq, kind] = header.match(HEADER)!;

    const sql: string[] = [];
    const frames: Frame[] = [];
    let section: "none" | "sql" | "trace" = "none";
    let timeMs = 0;

    for (const line of lines) {
        if (line.startsWith("SQL: ")) {
            section = "sql";
            sql.push(line.slice(5));
            continue;
        }
        if (line.startsWith("AFF: ")) {
            section = "none";
            continue;
        }
        if (line.startsWith("TIME: ")) {
            section = "none";
            timeMs = Number(line.slice(6)) * 1000;
            continue;
        }
        if (line.startsWith("TRACE: ")) {
            section = "trace";
            pushFrame(frames, line.slice(7));
            continue;
        }
        if (section === "sql") {
            sql.push(line);
        } else if (section === "trace") {
            pushFrame(frames, line);
        }
    }

    const deepest = frames[frames.length - 1];
    return {
        seq: Number(seq),
        kind,
        sql: sql.join("\n").trim(),
        timeMs: Number(timeMs.toFixed(3)),
        frames,
        entry: deepest ? deepest.file : "unknown",
    };
};

const pushFrame = (frames: Frame[], line: string): void => {
    const match = line.match(FRAME);
    if (match) {
        frames.push({ depth: Number(match[1]), call: match[2], file: match[3], line: Number(match[4]) });
    }
};

const INFRASTRUCTURE = [
    "vendor/magento/framework/DB/",
    "vendor/magento/zend-db/",
    "vendor/magento/framework/Model/ResourceModel/Db/",
    "vendor/magento/framework/Data/Collection/",
    "vendor/magento/framework/App/ResourceConnection/",
];

export const OBSIDIAN_MARKERS = [
    "MageObsidian",
    "mage-obsidian",
    "ObsidianProject/module-",
    "app/design/frontend/MageObsidian",
];

export const isObsidian = (file: string): boolean => OBSIDIAN_MARKERS.some((marker) => file.includes(marker));

export const shorten = (file: string): string => file.replace(/^.*?\/ObsidianProject\//, "");

export interface Origin {
    file: string;
    line: number;
    call: string;
    label: string;
    inObsidian: boolean;
    requestedBy: string | null;
}

const shortCall = (call: string): string => {
    const match = call.match(/^([A-Za-z0-9_\\]+)(?:\[[^\]]*\])?#[0-9a-fA-F]+#(->|::)(\w+)/);
    if (!match) {
        return call.split("(")[0];
    }
    const parts = match[1].split("\\");
    return `${parts[parts.length - 1]}${match[2]}${match[3]}`;
};

export const attribute = (frames: Frame[]): Origin => {
    const frame =
        frames.find((candidate) => !INFRASTRUCTURE.some((prefix) => candidate.file.startsWith(prefix))) ??
        frames[frames.length - 1];
    if (!frame) {
        return { file: "unknown", line: 0, call: "unknown", label: "unknown", inObsidian: false, requestedBy: null };
    }
    const ours = frames.find((candidate) => isObsidian(candidate.file));
    return {
        file: shorten(frame.file),
        line: frame.line,
        call: shortCall(frame.call),
        label: `${shortCall(frame.call)} at ${shorten(frame.file)}:${frame.line}`,
        inObsidian: ours !== undefined,
        requestedBy: ours ? `${shorten(ours.file)}:${ours.line}` : null,
    };
};

export const normaliseSql = (sql: string): string =>
    sql
        .replace(/\s+/g, " ")
        .replace(/'(?:[^']|'')*'/g, "?")
        .replace(/\b\d+\b/g, "?")
        .replace(/\((?:\s*\?\s*,)+\s*\?\s*\)/g, "(?)")
        .trim();

export const table = (sql: string): string => {
    const match = sql.match(/\bFROM\s+`?([a-z0-9_]+)`?/i) ?? sql.match(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+`?([a-z0-9_]+)`?/i);
    return match ? match[1] : "?";
};

export interface RepeatedPattern {
    sql: string;
    table: string;
    count: number;
    origin: string;
    requestedBy: string | null;
    inObsidian: boolean;
    totalMs: number;
}

export interface QueryReport {
    total: number;
    entry: string;
    byTable: { table: string; count: number }[];
    byOrigin: { origin: string; count: number; inObsidian: boolean }[];
    byRequester: { requester: string; count: number }[];
    repeated: RepeatedPattern[];
}

const rank = <T>(counts: Map<string, T & { count: number }>): (T & { count: number })[] =>
    [...counts.values()].sort((a, b) => b.count - a.count);

export const report = (blocks: QueryBlock[], threshold = 5): QueryReport => {
    const queries = blocks.filter((block) => block.kind === "QUERY");
    const byTable = new Map<string, { table: string; count: number }>();
    const byOrigin = new Map<string, { origin: string; count: number; inObsidian: boolean }>();
    const byRequester = new Map<string, { requester: string; count: number }>();
    const patterns = new Map<string, RepeatedPattern>();

    for (const block of queries) {
        const name = table(block.sql);
        const origin = attribute(block.frames);
        const shape = normaliseSql(block.sql);
        const key = `${shape}@@${origin.label}`;

        byTable.set(name, { table: name, count: (byTable.get(name)?.count ?? 0) + 1 });
        byOrigin.set(origin.label, {
            origin: origin.label,
            count: (byOrigin.get(origin.label)?.count ?? 0) + 1,
            inObsidian: origin.inObsidian,
        });

        if (origin.requestedBy) {
            byRequester.set(origin.requestedBy, {
                requester: origin.requestedBy,
                count: (byRequester.get(origin.requestedBy)?.count ?? 0) + 1,
            });
        }

        const existing = patterns.get(key);
        patterns.set(key, {
            sql: shape.length > 220 ? `${shape.slice(0, 220)}…` : shape,
            table: name,
            count: (existing?.count ?? 0) + 1,
            origin: origin.label,
            requestedBy: origin.requestedBy,
            inObsidian: origin.inObsidian,
            totalMs: Number(((existing?.totalMs ?? 0) + block.timeMs).toFixed(3)),
        });
    }

    return {
        total: queries.length,
        entry: queries[0]?.entry ?? "unknown",
        byTable: rank(byTable),
        byOrigin: rank(byOrigin),
        byRequester: rank(byRequester),
        repeated: [...patterns.values()].filter((pattern) => pattern.count >= threshold).sort((a, b) => b.count - a.count),
    };
};

export const withoutEntry = (blocks: QueryBlock[], entry: string): QueryBlock[] =>
    blocks.filter((block) => !block.entry.includes(entry));
