import type { RegistryEntry, Violation } from "./schema.ts";

export type ListedTest = {
    file: string;
    title: string;
    project: string;
    pending: boolean;
    tags: string[];
};

export const CAPABILITY_TAG = "cap:";
export const BEHAVIOUR_TAG = "behaviour:";

export const capabilityOf = (tag: string): string | null =>
    tag.startsWith(CAPABILITY_TAG) ? tag.slice(CAPABILITY_TAG.length) : null;

export const behaviourOf = (tag: string): string | null =>
    tag.startsWith(BEHAVIOUR_TAG) ? tag.slice(BEHAVIOUR_TAG.length) : null;

export const orphanBehaviours = (listed: ListedTest[], known: Set<string>): Violation[] => {
    const problems: Violation[] = [];
    const reported = new Set<string>();

    for (const test of listed) {
        for (const tag of test.tags) {
            const behaviour = behaviourOf(tag);
            if (!behaviour || known.has(behaviour) || reported.has(behaviour)) {
                continue;
            }
            reported.add(behaviour);
            problems.push({
                id: testKey(test),
                rule: "orphan-behaviour",
                detail: `tagged with a behaviour the registry does not declare: ${behaviour}`,
            });
        }
    }

    return problems;
};

export interface NotExecuted {
    project: string;
    title: string;
    reason: string | null;
}

/**
 * A check that did not run has to say which register entry carries what it could
 * not observe. Any entry will do — the register decides whether that entry is a
 * gap, a relaxed control or a decision; what matters here is that the absence is
 * traceable to one instead of resting on prose.
 */
export const unexplainedAbsences = (absent: NotExecuted[], entries: RegistryEntry[]): Violation[] =>
    absent
        .filter((test) => {
            const reason = (test.reason ?? "").trim();
            if (reason === "") {
                return true;
            }
            return !entries.some((entry) => reason.includes(entry.id));
        })
        .map((test) => ({
            id: `${test.project}: ${test.title}`,
            rule: "unexplained-absence",
            detail:
                (test.reason ?? "").trim() === ""
                    ? "did not run and said nothing about why"
                    : "did not run, and its reason names no register entry that carries what it could not observe",
        }));

export const coverageFromTags = (listed: ListedTest[], idFor: (capability: string) => string[]): Map<string, string[]> => {
    const coverage = new Map<string, string[]>();

    for (const test of listed) {
        if (test.pending) {
            continue;
        }
        for (const tag of test.tags) {
            const capability = capabilityOf(tag);
            if (!capability) {
                continue;
            }
            for (const id of idFor(capability)) {
                const tests = coverage.get(id) ?? [];
                const key = testKey(test);
                if (!tests.includes(key)) {
                    tests.push(key);
                }
                coverage.set(id, tests);
            }
        }
    }

    return coverage;
};

export const orphanTags = (listed: ListedTest[], known: Set<string>): Violation[] => {
    const problems: Violation[] = [];
    const reported = new Set<string>();

    for (const test of listed) {
        for (const tag of test.tags) {
            const capability = capabilityOf(tag);
            if (!capability || known.has(capability) || reported.has(capability)) {
                continue;
            }
            reported.add(capability);
            problems.push({
                id: testKey(test),
                rule: "orphan-tag",
                detail: `tagged with a capability the registry does not know: ${capability}`,
            });
        }
    }

    return problems;
};

export const testKey = (test: Pick<ListedTest, "file" | "title">): string => `${test.file}:${test.title}`;

const EXPLAINS_PENDING = new Set(["blocked", "out-of-scope", "uncovered"]);

export const crossCheck = (entries: RegistryEntry[], listed: ListedTest[]): Violation[] => {
    const problems: Violation[] = [];
    const liveKeys = new Set(listed.map(testKey));
    const runnableKeys = new Set(listed.filter((test) => !test.pending).map(testKey));

    for (const entry of entries) {
        for (const reference of entry.tests ?? []) {
            if (!liveKeys.has(reference)) {
                problems.push({ id: entry.id, rule: "missing-test", detail: `names a test the runner does not list: ${reference}` });
                continue;
            }
            if (entry.status === "covered" && !runnableKeys.has(reference)) {
                problems.push({ id: entry.id, rule: "covered-by-pending-test", detail: `claims coverage from a test that never runs: ${reference}` });
            }
        }
    }

    const explained = new Map<string, RegistryEntry>();
    for (const entry of entries) {
        for (const reference of entry.tests ?? []) {
            explained.set(reference, entry);
        }
    }

    for (const test of listed) {
        if (!test.pending) {
            continue;
        }
        const key = testKey(test);
        const entry = explained.get(key);
        if (!entry) {
            problems.push({ id: key, rule: "unexplained-pending", detail: "a pending test must have a registry entry that explains it" });
            continue;
        }
        if (!EXPLAINS_PENDING.has(entry.status) || !entry.reason?.trim()) {
            problems.push({ id: entry.id, rule: "pending-without-reason", detail: `explains pending test ${key} but its status does not account for it` });
        }
    }

    return problems;
};

export const parseListedTests = (report: unknown): ListedTest[] => {
    const listed: ListedTest[] = [];

    const walk = (suites: any[]): void => {
        for (const suite of suites ?? []) {
            for (const spec of suite.specs ?? []) {
                for (const test of spec.tests ?? []) {
                    const annotations = (test.annotations ?? []).map((annotation: any) => annotation.type);
                    listed.push({
                        file: spec.file,
                        title: spec.title,
                        project: test.projectName ?? "",
                        pending: test.expectedStatus === "skipped" || annotations.includes("fixme") || annotations.includes("skip"),
                        tags: spec.tags ?? [],
                    });
                }
            }
            walk(suite.suites ?? []);
        }
    };

    walk((report as any)?.suites ?? []);
    return listed;
};
