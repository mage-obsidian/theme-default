import { METRICS, PROTOCOLS } from "./protocol.ts";

export interface Backed {
    ceiling: number;
    measured: number;
    measuredAt: string;
}

export interface QueryBacked extends Backed {
    serverCache: string;
}

export interface PageBudget {
    path: string;
    protocol: string;
    metrics: Record<string, Backed>;
    queries?: QueryBacked;
}

export interface BudgetsDocument {
    schemaVersion: number;
    pages: Record<string, PageBudget>;
}

export const HEADROOM: Record<string, { factor: number; floor: number; round: number }> = {
    ttfb: { factor: 1.4, floor: 50, round: 5 },
    fcp: { factor: 1.3, floor: 100, round: 10 },
    lcp: { factor: 1.3, floor: 150, round: 10 },
    cls: { factor: 1.5, floor: 0.02, round: 0.005 },
    clsWhileLoading: { factor: 1.5, floor: 0.02, round: 0.005 },
    clsAfterLoad: { factor: 1.5, floor: 0.02, round: 0.005 },
    transferTotal: { factor: 1.2, floor: 51_200, round: 1024 },
    queries: { factor: 1.25, floor: 20, round: 5 },
};

export const ceilingFor = (metric: string, measured: number): number => {
    const rule = HEADROOM[metric];
    if (!rule) {
        throw new Error(`no headroom rule for "${metric}" — declare one before deriving a ceiling from a measurement`);
    }
    const raw = Math.max(measured * rule.factor, measured + rule.floor);
    return Number((Math.ceil(raw / rule.round) * rule.round).toFixed(4));
};

export const budgetFrom = (
    path: string,
    protocol: string,
    summary: Record<string, number>,
    measuredAt: string,
): PageBudget => ({
    path,
    protocol,
    metrics: Object.fromEntries(
        Object.keys(HEADROOM)
            .filter((metric) => metric !== "queries")
            .filter((metric) => typeof summary[metric] === "number")
            .map((metric) => [
                metric,
                { ceiling: ceilingFor(metric, summary[metric]), measured: summary[metric], measuredAt },
            ]),
    ),
});

export interface BudgetViolation {
    page: string;
    metric: string;
    rule: string;
    detail: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const known = new Set<string>([...METRICS, "clsWhileLoading", "clsAfterLoad"]);

const validateBacked = (page: string, metric: string, backed: Backed, out: BudgetViolation[]): void => {
    if (typeof backed.ceiling !== "number") {
        out.push({ page, metric, rule: "ceiling-required", detail: "no ceiling declared" });
        return;
    }
    if (typeof backed.measured !== "number") {
        out.push({
            page,
            metric,
            rule: "ceiling-without-measurement",
            detail: `ceiling ${backed.ceiling} has no measurement behind it`,
        });
        return;
    }
    if (!DATE.test(backed.measuredAt ?? "")) {
        out.push({
            page,
            metric,
            rule: "measurement-without-date",
            detail: `measured ${backed.measured} carries no date`,
        });
    }
    if (backed.ceiling < backed.measured) {
        out.push({
            page,
            metric,
            rule: "ceiling-below-measurement",
            detail: `ceiling ${backed.ceiling} is under the measurement ${backed.measured} that justifies it`,
        });
    }
};

export const validateBudgets = (document: BudgetsDocument): BudgetViolation[] => {
    const violations: BudgetViolation[] = [];
    for (const [page, budget] of Object.entries(document.pages ?? {})) {
        if (!budget.protocol) {
            violations.push({ page, metric: "-", rule: "protocol-required", detail: "the page names no protocol" });
        } else if (!PROTOCOLS[budget.protocol]) {
            violations.push({
                page,
                metric: "-",
                rule: "unknown-protocol",
                detail: `"${budget.protocol}" is not declared in src/perf/protocol.ts`,
            });
        }
        for (const [metric, backed] of Object.entries(budget.metrics ?? {})) {
            if (!known.has(metric)) {
                violations.push({ page, metric, rule: "unknown-metric", detail: "not a metric the harness collects" });
                continue;
            }
            validateBacked(page, metric, backed, violations);
        }
        if (budget.queries) {
            validateBacked(page, "queries", budget.queries, violations);
            if (!budget.queries.serverCache?.trim()) {
                violations.push({
                    page,
                    metric: "queries",
                    rule: "server-cache-state-required",
                    detail: "a query ceiling must name the server cache state it was counted under",
                });
            }
        }
    }
    return violations;
};

export interface Overrun {
    page: string;
    metric: string;
    value: number;
    ceiling: number;
    message: string;
}

export const overrun = (page: string, metric: string, value: number, ceiling: number): Overrun => ({
    page,
    metric,
    value,
    ceiling,
    message: `${page}: ${metric} measured ${value}, ceiling ${ceiling}`,
});

export const queryBudgetFrom = (measured: number, measuredAt: string, serverCache: string): QueryBacked => ({
    ceiling: ceilingFor("queries", measured),
    measured,
    measuredAt,
    serverCache,
});

export const checkPage = (
    page: string,
    budget: PageBudget,
    measured: Record<string, number>,
): Overrun[] => {
    const overruns: Overrun[] = [];
    for (const [metric, backed] of Object.entries(budget.metrics ?? {})) {
        const value = measured[metric];
        if (typeof value !== "number") {
            continue;
        }
        if (value > backed.ceiling) {
            overruns.push(overrun(page, metric, value, backed.ceiling));
        }
    }
    if (budget.queries && typeof measured.queries === "number" && measured.queries > budget.queries.ceiling) {
        overruns.push(overrun(page, "queries", measured.queries, budget.queries.ceiling));
    }
    return overruns;
};

export const checkBudgets = (
    document: BudgetsDocument,
    measurements: Record<string, Record<string, number>>,
): Overrun[] =>
    Object.entries(document.pages ?? {}).flatMap(([page, budget]) => {
        const measured = measurements[page];
        return measured ? checkPage(page, budget, measured) : [];
    });
