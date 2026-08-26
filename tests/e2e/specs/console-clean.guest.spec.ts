import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { classifyConsole, type AcceptedNote, type ConsoleNote } from "../src/perf/console";
import { GUEST_PAGES } from "../src/perf/pages";

const here = dirname(fileURLToPath(import.meta.url));
const { accepted } = JSON.parse(
    readFileSync(resolve(here, "../perf/accepted-console.json"), "utf8"),
) as { accepted: AcceptedNote[] };

test.describe("the public pages load without noise", () => {
    for (const definition of GUEST_PAGES) {
        test(`${definition.name} logs nothing that is not declared`, { tag: `@cap:${definition.capability}` }, async ({ page }) => {
            const notes: ConsoleNote[] = [];
            page.on("console", (message) => {
                if (message.type() === "error" || message.type() === "warning") {
                    notes.push({ page: definition.name, type: message.type(), text: message.text() });
                }
            });
            page.on("pageerror", (error) => {
                notes.push({ page: definition.name, type: "pageerror", text: error.message });
            });
            page.on("requestfailed", (request) => {
                notes.push({
                    page: definition.name,
                    type: "requestfailed",
                    text: `${request.url()} — ${request.failure()?.errorText ?? "failed"}`,
                });
            });
            page.on("response", (response) => {
                if (response.status() >= 400) {
                    notes.push({ page: definition.name, type: "response", text: `${response.status()} ${response.url()}` });
                }
            });

            if (definition.prepare) {
                await definition.prepare(page);
            }
            await page.goto(definition.path, { waitUntil: "load" });
            await page.waitForTimeout(2500);

            const { unexplained } = classifyConsole(notes, accepted);
            expect(unexplained.map((note) => `${note.type}: ${note.text}`), unexplained.map((n) => `${n.type}: ${n.text}`).join("\n")).toEqual([]);
        });
    }

    test("a warning nobody declared reaches the check, and declaring it silences it", { tag: "@cap:cms_index_index" }, async ({ page }) => {
        const planted = "e2e planted warning: the wish list counter disagreed with its section";
        await page.addInitScript(`console.warn(${JSON.stringify(planted)});`);

        const notes: ConsoleNote[] = [];
        page.on("console", (message) => {
            if (message.type() === "error" || message.type() === "warning") {
                notes.push({ page: "home", type: message.type(), text: message.text() });
            }
        });

        await page.goto("/", { waitUntil: "load" });
        await page.waitForTimeout(1500);

        expect(classifyConsole(notes, accepted).unexplained.map((note) => note.text)).toEqual([planted]);

        const declared = classifyConsole(notes, [
            ...accepted,
            { page: "home", match: "planted warning", reason: "the check proving itself: this warning is planted by the test" },
        ]);
        expect(declared.unexplained).toEqual([]);
        expect(declared.accepted[0].reason).toBe("the check proving itself: this warning is planted by the test");
    });
});
