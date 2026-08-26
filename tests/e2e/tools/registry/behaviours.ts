import type { Platform, RegistryEntry } from "./schema.ts";
import { BEHAVIOUR_TAG, testKey, type ListedTest } from "./crossCheck.ts";

export const OBSERVABLE_BEHAVIOURS: Record<string, string> = {
    "form-key": "A form served from a cached page submits with a live form key, and an invalid one is rejected",
    "private-sections": "Customer data never rides in a cacheable response and arrives through the customer section channel",
    "session-messages": "A message queued on the server reaches the DOM through both competing channels",
    "structured-data": "Declared structured data is emitted and is valid JSON that hostile content cannot break out of",
    "client-startup": "Taking over a server-painted region never destroys it nor leaves it blank",
    bfcache: "Navigating back restores the page from the browser cache where it should",
    "touch-targets": "Interactive controls meet the minimum touch target size",
    "unescaped-output": "Every value the theme emits unescaped is classified with the origin of the value and why it is safe",
    "island-authorization": "The calls the interactive regions make authorise as the customer they claim to be",
    "declared-environment": "The environment a security check ran in is declared, and a relaxed control makes the check non-conclusive",
    "competitive-perimeter": "The competitive comparison declares its perimeter, its evidence regime and its approval state",
    "remediation-list": "Every proposed remediation traces to the register entries that motivate it",
};

export const behaviourEntries = (listed: ListedTest[], platform: Platform): RegistryEntry[] => {
    const covering = new Map<string, string[]>();

    for (const test of listed) {
        for (const tag of test.tags) {
            if (!tag.startsWith(BEHAVIOUR_TAG)) {
                continue;
            }
            const behaviour = tag.slice(BEHAVIOUR_TAG.length);
            const tests = covering.get(behaviour) ?? [];
            const key = testKey(test);
            if (!test.pending && !tests.includes(key)) {
                tests.push(key);
            }
            covering.set(behaviour, tests);
        }
    }

    return Object.entries(OBSERVABLE_BEHAVIOURS).map(([behaviour, capability]) => {
        const tests = covering.get(behaviour) ?? [];
        const entry: RegistryEntry = {
            id: `behaviour/${behaviour}`,
            capability,
            origin: "parity",
            status: tests.length > 0 ? "covered" : "uncovered",
            severity: tests.length > 0 ? "informational" : "major",
            evidence: {
                observation:
                    tests.length > 0
                        ? `exercised by ${tests.length} test${tests.length === 1 ? "" : "s"} tagged @${BEHAVIOUR_TAG}${behaviour}`
                        : "no test carries this behaviour tag",
                confirmed: true,
            },
        };
        if (tests.length > 0) {
            entry.tests = tests;
            entry.platform = platform;
        } else {
            entry.reason = "observable behaviour declared in the parity spec with no test exercising it yet";
        }
        return entry;
    });
};
