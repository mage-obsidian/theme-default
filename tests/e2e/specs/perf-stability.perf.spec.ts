import { expect, test } from "@playwright/test";
import { GUEST_PAGES } from "../src/perf/pages";
import { measurePage } from "../src/perf/measure";
import { compareRuns, describeProtocol, protocolById } from "../src/perf/protocol";

const SUBJECTS = GUEST_PAGES.filter((definition) => ["home", "plp"].includes(definition.name));

test.describe("the protocol is reproducible", () => {
    test.slow();

    for (const definition of SUBJECTS) {
        test(`${definition.name} measures the same twice under the same protocol`, { tag: `@cap:${definition.capability}` }, async ({ context, page }) => {
            const protocol = protocolById(definition.protocol);
            const first = await measurePage(context, page, definition);
            const second = await measurePage(context, page, definition);

            const divergences = compareRuns(first.summary, second.summary, protocol);
            const report = divergences
                .map((d) => `${d.metric}: ${d.first} vs ${d.second} (drift ${(d.drift * 100).toFixed(0)}%, tolerance ${(d.tolerance * 100).toFixed(0)}%)`)
                .join("\n");

            expect(divergences, `${describeProtocol(protocol)}\n${report}`).toEqual([]);
        });
    }
});
