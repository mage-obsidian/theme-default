import { expect, test } from "@playwright/test";
import { checkPage } from "../src/perf/budgets";
import { GUEST_PAGES, COLD_PAGES } from "../src/perf/pages";
import { expectedEdge, measurePage, readBudgets, writeRun, type SampledPage } from "../src/perf/measure";
import { protocolById } from "../src/perf/protocol";

const RUN = process.env.PERF_RUN ?? "run";
const collected: SampledPage[] = [];

test.describe.configure({ mode: "serial" });

test.describe("performance budgets", () => {
    test.slow();

    for (const definition of [...GUEST_PAGES, ...COLD_PAGES]) {
        test(`${definition.name} stays inside its budget`, { tag: `@cap:${definition.capability}` }, async ({ context, page }) => {
            const protocol = protocolById(definition.protocol);
            const sampled = await measurePage(context, page, definition);
            collected.push(sampled);

            const wanted = expectedEdge(definition, protocol);
            const wrong = sampled.edges.filter((edge) => !wanted.includes(edge));
            expect(
                wrong,
                `the ${protocol.cache} protocol needs every sample served ${wanted.join(" or ")}; got ${sampled.edges.join(", ")}`,
            ).toEqual([]);

            const budget = readBudgets().pages[definition.name];
            test.skip(!budget, `no budget recorded yet for ${definition.name} — run with PERF_RUN to record one`);

            const overruns = checkPage(definition.name, budget, sampled.summary);
            expect(overruns.map((o) => o.message), overruns.map((o) => o.message).join("\n")).toEqual([]);
        });
    }

    test.afterAll(() => {
        if (collected.length > 0) {
            writeRun(RUN, collected);
        }
    });
});
