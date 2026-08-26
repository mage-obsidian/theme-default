import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseQueryLog, report, withoutEntry, type QueryReport } from "./queryLog.ts";
import { GUEST_PAGES } from "../../src/perf/pages.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(here, "../../.artifacts");
const BASE = process.env.E2E_BASE_URL ?? "https://zento-obsidian.test";
const LOG = "var/debug/db.log";

const php = (script: string): string =>
    execFileSync("zento", ["compose", "exec", "-T", "php-noxdebug", "sh", "-lc", script], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });

const fetchPage = (url: string): void => {
    execFileSync("curl", ["-s", "-o", "/dev/null", "-k", "--noproxy", "*", url], { encoding: "utf8" });
};

const flushBlocks = (): void => {
    execFileSync("zento", ["magento", "cache:clean", "block_html", "full_page", "collections"], { encoding: "utf8" });
};

export interface PageQueries extends QueryReport {
    page: string;
    path: string;
    url: string;
    serverCache: "cold" | "warm";
}

const cacheState = (process.argv[2] === "warm" ? "warm" : "cold") as "cold" | "warm";
const run = process.argv[3] ?? cacheState;
const threshold = Number(process.env.REPEAT_THRESHOLD ?? "5");

const enabled = php(`php -r '$c = include "app/etc/env.php"; echo isset($c["db_logger"]) ? "yes" : "no";'`).trim();
if (enabled !== "yes") {
    console.error(
        "the DB query log is off — run `zento compose exec -T php-noxdebug php bin/magento dev:query-log:enable` " +
            "and restart php, then measure again",
    );
    process.exit(1);
}

const measured: PageQueries[] = [];

for (const definition of GUEST_PAGES) {
    if (cacheState === "cold") {
        flushBlocks();
    }
    const separator = definition.path.includes("?") ? "&" : "?";
    const url = `${BASE}${definition.path}${separator}e2equeries=${definition.name}-${run}`;
    if (cacheState === "warm") {
        fetchPage(url);
    }
    php(`: > ${LOG}`);
    fetchPage(url);
    const blocks = withoutEntry(parseQueryLog(php(`cat ${LOG} 2>/dev/null || true`)), "health_check");
    measured.push({
        page: definition.name,
        path: definition.path,
        url,
        serverCache: cacheState,
        ...report(blocks, threshold),
    });
}

if (!existsSync(ARTIFACTS)) {
    mkdirSync(ARTIFACTS, { recursive: true });
}
const out = resolve(ARTIFACTS, `queries-${run}.json`);
writeFileSync(out, `${JSON.stringify(measured, null, 2)}\n`);

for (const page of measured) {
    console.log(`\n${page.page} (server cache ${page.serverCache}) — ${page.total} queries`);
    for (const origin of page.byOrigin.slice(0, 5)) {
        console.log(`   ${String(origin.count).padStart(4)}  ${origin.inObsidian ? "obsidian" : "core    "}  ${origin.origin}`);
    }
    if (page.byRequester.length > 0) {
        console.log("   asked for by MageObsidian:");
        for (const requester of page.byRequester.slice(0, 6)) {
            console.log(`   ${String(requester.count).padStart(4)}  ${requester.requester}`);
        }
    }
    for (const pattern of page.repeated) {
        const via = pattern.requestedBy ? ` via ${pattern.requestedBy}` : "";
        console.log(`   repeated ×${pattern.count} on ${pattern.table} from ${pattern.origin}${via}`);
    }
}
console.log(`\nwrote ${out}`);
