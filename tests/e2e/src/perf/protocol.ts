export type CacheState = "cold" | "warm";
export type SessionState = "guest" | "customer";

export interface NetworkProfile {
    downloadKbps: number;
    uploadKbps: number;
    latencyMs: number;
}

export interface Protocol {
    id: string;
    cache: CacheState;
    cpuThrottle: number;
    network: NetworkProfile | null;
    viewport: { width: number; height: number };
    session: SessionState;
    samples: number;
    settleMs: number;
    tolerance: Record<string, number>;
}

export const METRICS = ["ttfb", "fcp", "lcp", "cls", "transferTotal"] as const;
export type MetricName = (typeof METRICS)[number];

const SHARED_TOLERANCE: Record<string, number> = {
    ttfb: 0.6,
    fcp: 0.35,
    lcp: 0.35,
    cls: 0.5,
    transferTotal: 0.1,
};

export const PROTOCOLS: Record<string, Protocol> = {
    "warm-guest-desktop": {
        id: "warm-guest-desktop",
        cache: "warm",
        cpuThrottle: 4,
        network: null,
        viewport: { width: 1440, height: 900 },
        session: "guest",
        samples: 3,
        settleMs: 3000,
        tolerance: SHARED_TOLERANCE,
    },
    "warm-customer-desktop": {
        id: "warm-customer-desktop",
        cache: "warm",
        cpuThrottle: 4,
        network: null,
        viewport: { width: 1440, height: 900 },
        session: "customer",
        samples: 3,
        settleMs: 3000,
        tolerance: SHARED_TOLERANCE,
    },
    "cold-guest-desktop": {
        id: "cold-guest-desktop",
        cache: "cold",
        cpuThrottle: 4,
        network: null,
        viewport: { width: 1440, height: 900 },
        session: "guest",
        samples: 2,
        settleMs: 3000,
        tolerance: SHARED_TOLERANCE,
    },
};

export const protocolById = (id: string): Protocol => {
    const protocol = PROTOCOLS[id];
    if (!protocol) {
        throw new Error(`unknown protocol "${id}" — declare it in src/perf/protocol.ts before measuring under it`);
    }
    return protocol;
};

export const COLD_PARAM = "e2ecold";

export class RequestLedger {
    private readonly asked = new Set<string>();
    private issued = 0;

    record(url: string): void {
        this.asked.add(url);
    }

    hasAsked(url: string): boolean {
        return this.asked.has(url);
    }

    coldUrl(path: string, seed = `${process.pid.toString(36)}`): string {
        this.issued += 1;
        const separator = path.includes("?") ? "&" : "?";
        const url = `${path}${separator}${COLD_PARAM}=${seed}-${this.issued.toString(36)}`;
        if (this.asked.has(url)) {
            throw new Error(`cold measurement of ${path} would reuse a URL the instrumentation already requested`);
        }
        return url;
    }
}

export interface Divergence {
    metric: string;
    first: number;
    second: number;
    tolerance: number;
    drift: number;
}

export const drift = (first: number, second: number): number =>
    Math.abs(first - second) / Math.max(Math.abs(first), Math.abs(second), 1);

export const compareRuns = (
    first: Record<string, number>,
    second: Record<string, number>,
    protocol: Protocol,
): Divergence[] => {
    const divergences: Divergence[] = [];
    for (const [metric, tolerance] of Object.entries(protocol.tolerance)) {
        const a = first[metric];
        const b = second[metric];
        if (typeof a !== "number" || typeof b !== "number") {
            continue;
        }
        const observed = drift(a, b);
        if (observed > tolerance) {
            divergences.push({ metric, first: a, second: b, tolerance, drift: observed });
        }
    }
    return divergences;
};

export const describeProtocol = (protocol: Protocol): string =>
    [
        `page-cache=${protocol.cache}`,
        "browser-cache=cleared-before-every-sample",
        `cpu=${protocol.cpuThrottle}x`,
        `network=${protocol.network ? `${protocol.network.downloadKbps}kbps/${protocol.network.latencyMs}ms` : "unthrottled"}`,
        `viewport=${protocol.viewport.width}x${protocol.viewport.height}`,
        `session=${protocol.session}`,
        `samples=${protocol.samples}`,
    ].join(" ");
