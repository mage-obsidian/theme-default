import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE, baseURL } from "./src/env";

export default defineConfig({
    testDir: "./specs",
    // Playwright wipes outputDir on every run, and the seed's handover lives one
    // level up in .artifacts — keep its own results in a subfolder of it.
    outputDir: "./.artifacts/test-results",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
    timeout: 45_000,
    expect: { timeout: 10_000 },

    use: {
        baseURL,
        // The dev environment terminates TLS with a self-signed certificate.
        ignoreHTTPSErrors: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "off",
    },

    projects: [
        {
            name: "signin",
            testDir: "./setup",
            testMatch: /auth\.setup\.ts/,
        },
        {
            name: "desktop",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE },
            dependencies: ["signin"],
            testIgnore: [/\.guest\.spec\.ts/, /\.mobile\.spec\.ts/, /\.last\.spec\.ts/, /\.paint\.spec\.ts/, /\.headed\.spec\.ts/],
        },
        {
            name: "mobile",
            use: { ...devices["Pixel 7"], storageState: AUTH_STATE },
            dependencies: ["signin"],
            testMatch: /\.mobile\.spec\.ts/,
        },
        {
            // Last on purpose: signing out invalidates the session server-side, and
            // every other signed-in project shares it.
            name: "signout",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE },
            dependencies: ["desktop", "mobile"],
            testMatch: /\.last\.spec\.ts/,
        },
        {
            // Signed out on purpose: the auth screens redirect a known customer away.
            name: "guest",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
            testMatch: /\.guest\.spec\.ts/,
        },
        {
            // Paint tests run signed out and throttled, because the gap between a
            // page arriving and its islands taking over is invisible on an idle
            // machine and obvious on a real one. Playwright ships
            // --disable-back-forward-cache in its defaults, which would make the
            // back/forward assertions pass by never testing anything.
            name: "paint",
            use: {
                ...devices["Desktop Chrome"],
                viewport: { width: 1440, height: 900 },
                launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
            },
            testMatch: /\.paint\.spec\.ts/,
            testIgnore: /\.headed\.spec\.ts/,
        },
        {
            // Headed on purpose: Chromium disables the back/forward cache while
            // headless whatever the flags say, so a headless run of these would
            // assert nothing. Skipped where there is no display.
            name: "bfcache",
            use: {
                ...devices["Desktop Chrome"],
                viewport: { width: 1440, height: 900 },
                headless: false,
                launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
            },
            testMatch: /\.headed\.spec\.ts/,
        },
    ],
});
