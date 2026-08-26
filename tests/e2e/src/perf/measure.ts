import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import { applyProtocol, edgeState, installMetricsProbe, readMetrics, summarise, type Measurement, type PageMetrics } from "./collect.ts";
import type { PageUnderBudget } from "./pages.ts";
import { protocolById, RequestLedger, type Protocol } from "./protocol.ts";
import type { BudgetsDocument } from "./budgets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const BUDGETS = resolve(here, "../../perf/budgets.json");
const ARTIFACTS = resolve(here, "../../.artifacts");

export const readBudgets = (): BudgetsDocument => JSON.parse(readFileSync(BUDGETS, "utf8")) as BudgetsDocument;

export const budgetsPath = BUDGETS;

export interface SampledPage {
    page: string;
    path: string;
    protocol: string;
    edges: string[];
    samples: PageMetrics[];
    summary: Record<string, number>;
}

const ledger = new RequestLedger();

export const measurePage = async (
    context: BrowserContext,
    page: Page,
    definition: PageUnderBudget,
): Promise<SampledPage> => {
    const protocol: Protocol = protocolById(definition.protocol);
    await installMetricsProbe(context);
    const session = await applyProtocol(context, page, protocol);

    if (definition.prepare) {
        await definition.prepare(page);
    }
    if (definition.cacheable && protocol.cache === "warm") {
        const primer = await page.goto(definition.path, { waitUntil: "load" });
        ledger.record(definition.path);
        void primer;
    }

    const samples: PageMetrics[] = [];
    const edges: string[] = [];

    for (let i = 0; i < protocol.samples; i++) {
        const url =
            definition.cacheable && protocol.cache === "cold" ? ledger.coldUrl(definition.path) : definition.path;
        await session.clearBrowserCache();
        const response = await page.goto(url, { waitUntil: "commit" });
        ledger.record(url);
        await page.waitForLoadState("load").catch(() => {});
        await page.waitForTimeout(protocol.settleMs);
        samples.push(await readMetrics(page));
        edges.push(edgeState(response).edge);
    }

    return {
        page: definition.name,
        path: definition.path,
        protocol: protocol.id,
        edges,
        samples,
        summary: summarise(samples),
    };
};

export const expectedEdge = (definition: PageUnderBudget, protocol: Protocol): string[] =>
    definition.cacheable && protocol.cache === "warm" ? ["HIT"] : ["MISS", "UNCACHEABLE"];

export const writeRun = (name: string, run: SampledPage[]): string => {
    if (!existsSync(ARTIFACTS)) {
        mkdirSync(ARTIFACTS, { recursive: true });
    }
    const path = resolve(ARTIFACTS, `perf-${name}.json`);
    writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
    return path;
};

export const asMeasurement = (sampled: SampledPage, measuredAt: string): Measurement[] =>
    sampled.samples.map((sample, index) => ({
        ...sample,
        page: sampled.page,
        path: sampled.path,
        url: sampled.path,
        protocol: sampled.protocol,
        cacheState: sampled.edges[index] === "HIT" ? "warm" : "cold",
        edge: sampled.edges[index],
        measuredAt,
    }));
