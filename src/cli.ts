#!/usr/bin/env node
/**
 * `responsive-overflow-tests init` — scaffolds a minimal Playwright wiring so a
 * fresh project can go from install to a green overflow run. Node built-ins
 * only, no runtime deps. Non-destructive: it never overwrites an existing file,
 * so it is safe to re-run.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const PLAYWRIGHT_CONFIG = `import { defineConfig } from "@playwright/test";

// Boots your site, then runs the specs in ./e2e against it.
// Adapt \`webServer\` + \`baseURL\` to how your project serves locally:
//   Astro dev:      command "npm run dev",           url "http://localhost:4321"
//   Astro preview:  command "npm run build && npm run preview", url "http://localhost:4321"
//   Next dev:       command "npm run dev",           url "http://localhost:3000"
//   Static server:  command "npx http-server ./dist -p 8080", url "http://localhost:8080"
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:4321",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
`;

const SPEC = `import { defineOverflowTests } from "responsive-overflow-tests";

// Routes are relative to the \`baseURL\` in playwright.config.ts.
// Add every route you want guarded against horizontal overflow.
defineOverflowTests({
  routes: ["/"],
  tier: "light",
});
`;

type Target = { path: string; contents: string };

function writeIfAbsent({ path, contents }: Target): "created" | "skipped" {
  if (existsSync(path)) return "skipped";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return "created";
}

function init(): void {
  const cwd = process.cwd();
  const targets: Target[] = [
    { path: resolve(cwd, "playwright.config.ts"), contents: PLAYWRIGHT_CONFIG },
    { path: resolve(cwd, join("e2e", "overflow.spec.ts")), contents: SPEC },
  ];

  for (const target of targets) {
    const rel = target.path.slice(cwd.length + 1);
    const result = writeIfAbsent(target);
    if (result === "created") {
      console.log(`  created  ${rel}`);
    } else {
      console.log(`  skipped  ${rel} (already exists)`);
    }
  }

  console.log(
    [
      "",
      "Next steps:",
      "  1. Install the peer dep + browser (if you haven't):",
      "       npm install --save-dev @playwright/test",
      "       npx playwright install chromium",
      "  2. Adjust webServer.command / baseURL in playwright.config.ts for your stack.",
      "  3. Edit the routes array in e2e/overflow.spec.ts.",
      "  4. Run it:  npx playwright test",
      "",
    ].join("\n")
  );
}

function main(): void {
  const command = process.argv[2];

  if (command === "init") {
    init();
    return;
  }

  console.log(
    [
      "responsive-overflow-tests",
      "",
      "Usage:",
      "  npx responsive-overflow-tests init    scaffold playwright.config.ts + e2e/overflow.spec.ts",
      "",
    ].join("\n")
  );

  if (command && command !== "help" && command !== "--help" && command !== "-h") {
    process.exitCode = 1;
  }
}

main();
