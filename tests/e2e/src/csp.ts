import type { BrowserContext, Page } from "@playwright/test";

export const POLICY = [
    "default-src 'self'",
    "script-src 'self' 'report-sample'",
    "style-src 'self' 'report-sample'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
].join("; ");

export interface Violation {
    page: string;
    directive: string;
    blocked: string;
    sample: string;
}

declare global {
    interface Window {
        __csp?: { directive: string; blocked: string; sample: string }[];
    }
}

const LISTENER = `
(() => {
  window.__csp = [];
  addEventListener('securitypolicyviolation', (event) => {
    window.__csp.push({
      directive: event.effectiveDirective || event.violatedDirective,
      blocked: event.blockedURI,
      sample: (event.sample || '').slice(0, 120),
    });
  });
})();
`;

export const enforce = async (context: BrowserContext): Promise<void> => {
    await context.addInitScript(LISTENER);
    await context.route("**/*", async (route) => {
        const response = await route.fetch();
        const headers = { ...response.headers() };
        const type = headers["content-type"] ?? "";
        if (type.includes("text/html")) {
            headers["content-security-policy"] = POLICY;
            delete headers["content-security-policy-report-only"];
        }
        await route.fulfill({ response, headers });
    });
};

export const readViolations = async (page: Page, name: string): Promise<Violation[]> => {
    const raw = await page.evaluate(() => window.__csp ?? []);
    return raw.map((entry) => ({ page: name, ...entry }));
};

export interface AcceptedViolation {
    page: string;
    directive: string;
    blocked: string;
    sampleContains: string;
    emittedBy: string;
    reason: string;
}

const matches = (accepted: AcceptedViolation, violation: Violation): boolean =>
    (accepted.page === "*" || accepted.page === violation.page) &&
    accepted.directive === violation.directive &&
    (accepted.blocked === "*" || accepted.blocked === violation.blocked) &&
    (accepted.sampleContains === "" || violation.sample.includes(accepted.sampleContains));

export const classifyViolations = (
    violations: Violation[],
    accepted: AcceptedViolation[],
): { accepted: { violation: Violation; entry: AcceptedViolation }[]; undeclared: Violation[] } => {
    const result: { accepted: { violation: Violation; entry: AcceptedViolation }[]; undeclared: Violation[] } = {
        accepted: [],
        undeclared: [],
    };
    for (const violation of violations) {
        const entry = accepted.find((candidate) => matches(candidate, violation));
        if (entry) {
            result.accepted.push({ violation, entry });
        } else {
            result.undeclared.push(violation);
        }
    }
    return result;
};

export const dedupe = (violations: Violation[]): Violation[] => {
    const seen = new Set<string>();
    return violations.filter((violation) => {
        const key = `${violation.page}|${violation.directive}|${violation.blocked}|${violation.sample}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};
