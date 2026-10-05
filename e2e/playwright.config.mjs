import { defineConfig, devices } from "@playwright/test";

// Drives the BUILT site (build/web) in three engines, served the way Firebase
// Hosting serves it, so these checks see exactly what a deploy ships.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4317", reducedMotion: "reduce" },
  webServer: {
    command: "node serve.mjs",
    url: "http://127.0.0.1:4317/",
    reuseExistingServer: true,
    stdout: "ignore",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // Firefox is opt-in: on this machine Windows refuses to execute the
    // downloaded firefox.exe ("Permission denied"). Allow it in your
    // security software, then run with E2E_FIREFOX=1.
    ...(process.env.E2E_FIREFOX ? [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }] : []),
  ],
});
