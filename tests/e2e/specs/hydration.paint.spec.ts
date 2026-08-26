import { expect, test } from "@playwright/test";
import { hydrationPath, settle } from "../src/paint";

/**
 * Vue reports a hydration mismatch once per app and then patches the DOM it
 * disagrees with, so the only visible symptom is a subtree redrawn a frame after
 * it was already painted. The console is the only place it is ever stated.
 */
test.describe("hydration", () => {
    for (const step of hydrationPath) {
        test(`${step.name} hydrates onto the markup the server sent`, { tag: "@behaviour:client-startup" }, async ({ page }) => {
            const complaints: string[] = [];
            page.on("console", (message) => {
                if (message.text().includes("Hydration")) {
                    complaints.push(message.text());
                }
            });

            await page.goto(step.path, { waitUntil: "commit" });
            await page.waitForLoadState("load").catch(() => {});
            await settle(page, 2500);

            expect(complaints, `${step.path} reported a hydration mismatch`).toEqual([]);
        });
    }
});
