import type { BrowserContext, Page, Response } from "@playwright/test";
import type { CacheState, Protocol } from "./protocol.ts";

export interface ShiftSample {
    value: number;
    at: number;
    readyState: string;
}

export interface TransferByClass {
    document: number;
    script: number;
    style: number;
    image: number;
    font: number;
    other: number;
}

export interface PageMetrics {
    ttfb: number;
    fcp: number;
    lcp: number;
    cls: number;
    clsWhileLoading: number;
    clsAfterLoad: number;
    transferTotal: number;
    transfer: TransferByClass;
    shifts: ShiftSample[];
}

export interface Measurement extends PageMetrics {
    page: string;
    path: string;
    url: string;
    protocol: string;
    cacheState: CacheState;
    edge: string;
    measuredAt: string;
}

declare global {
    interface Window {
        __perf?: {
            shifts: ShiftSample[];
            lcp: number;
        };
    }
}

const PROBE = `
(() => {
  const state = { shifts: [], lcp: 0 };
  window.__perf = state;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        state.shifts.push({
          value: entry.value,
          at: Math.round(entry.startTime),
          readyState: document.readyState,
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) state.lcp = Math.round(last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
})();
`;

export const installMetricsProbe = async (context: BrowserContext): Promise<void> => {
    await context.addInitScript(PROBE);
};

export interface Session {
    clearBrowserCache: () => Promise<void>;
}

export const applyProtocol = async (context: BrowserContext, page: Page, protocol: Protocol): Promise<Session> => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: protocol.cpuThrottle });
    await cdp.send("Network.enable");
    if (protocol.network) {
        await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            downloadThroughput: (protocol.network.downloadKbps * 1024) / 8,
            uploadThroughput: (protocol.network.uploadKbps * 1024) / 8,
            latency: protocol.network.latencyMs,
        });
    }
    return {
        clearBrowserCache: async () => {
            await cdp.send("Network.clearBrowserCache");
        },
    };
};

export const readMetrics = (page: Page): Promise<PageMetrics> =>
    page.evaluate((): PageMetrics => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const paint = performance.getEntriesByName("first-contentful-paint")[0];
        const shifts = window.__perf?.shifts ?? [];
        const loadEnd = nav ? nav.responseEnd : 0;

        const empty: TransferByClass = { document: 0, script: 0, style: 0, image: 0, font: 0, other: 0 };
        const transfer = { ...empty };
        transfer.document = nav ? nav.transferSize : 0;

        for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
            const size = entry.transferSize || 0;
            const name = entry.name.split("?")[0];
            if (entry.initiatorType === "script" || /\.m?js$/.test(name)) transfer.script += size;
            else if (entry.initiatorType === "css" || entry.initiatorType === "link" || /\.css$/.test(name)) transfer.style += size;
            else if (entry.initiatorType === "img" || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(name)) transfer.image += size;
            else if (/\.(woff2?|ttf|otf|eot)$/.test(name)) transfer.font += size;
            else transfer.other += size;
        }

        const total = Object.values(transfer).reduce((sum, value) => sum + value, 0);
        const sum = (list: ShiftSample[]) => Number(list.reduce((acc, s) => acc + s.value, 0).toFixed(4));

        return {
            ttfb: nav ? Math.round(nav.responseStart) : 0,
            fcp: paint ? Math.round(paint.startTime) : 0,
            lcp: window.__perf?.lcp ?? 0,
            cls: sum(shifts),
            clsWhileLoading: sum(shifts.filter((s) => s.readyState === "loading" || s.at <= loadEnd)),
            clsAfterLoad: sum(shifts.filter((s) => s.readyState !== "loading" && s.at > loadEnd)),
            transferTotal: total,
            transfer,
            shifts,
        };
    });

export const edgeState = (response: Response | null): { cacheState: CacheState; edge: string } => {
    if (!response) {
        return { cacheState: "cold", edge: "no-response" };
    }
    const headers = response.headers();
    const debug = headers["x-magento-cache-debug"] ?? "";
    const age = Number(headers["age"] ?? "0");
    const via = headers["x-magento-cache-control"] ?? headers["cache-control"] ?? "";
    const hit = debug.toUpperCase() === "HIT" || age > 0;
    return { cacheState: hit ? "warm" : "cold", edge: debug || (age > 0 ? `age=${age}` : via || "unknown") };
};

export const median = (values: number[]): number => {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(4));
};

export const summarise = (samples: PageMetrics[]): Record<string, number> => ({
    ttfb: median(samples.map((s) => s.ttfb)),
    fcp: median(samples.map((s) => s.fcp)),
    lcp: median(samples.map((s) => s.lcp)),
    cls: median(samples.map((s) => s.cls)),
    clsWhileLoading: median(samples.map((s) => s.clsWhileLoading)),
    clsAfterLoad: median(samples.map((s) => s.clsAfterLoad)),
    transferTotal: median(samples.map((s) => s.transferTotal)),
});
