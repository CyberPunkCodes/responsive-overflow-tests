import type { PlaywrightTestConfig } from "@playwright/test";
import {
  DEFAULT_TEST_DIR,
  authStoragePath,
  resolveBaseURL,
  resolveOutputDir,
  resolveTier,
  resolveWebServerEnv,
} from "./config.js";
import type { ResponsiveConfig } from "./types.js";

/**
 * Translates the single user-facing config into a Playwright config.
 *
 * Everything Playwright would otherwise scatter across the project root
 * (`test-results/`, `playwright-report/`, `blob-report/`) is redirected under
 * one directory — `.playwright/` by default — so a consumer has exactly one
 * line to gitignore. With the `list` reporter and `retain-on-failure` traces,
 * a passing run leaves only Playwright's own bookkeeping file behind.
 *
 * Note: no `import.meta` anywhere in this package. Playwright transpiles
 * imported modules to CommonJS when the consuming project isn't ESM, and
 * `import.meta` is a parse-time syntax error under CJS — it would break the
 * package for the majority of projects.
 */
export function toPlaywrightConfig(config: ResponsiveConfig): PlaywrightTestConfig {
  const baseURL = resolveBaseURL(config);

  if (!baseURL) {
    throw new Error(
      "responsive-overflow-tests: set `port` (local server) or `baseURL` (deployed site) " +
        "in your config — toPlaywrightConfig() needs to know where the site is.\n" +
        "If you are merging into an existing Playwright config that already sets " +
        "use.baseURL, you don't need toPlaywrightConfig() at all — see " +
        "ADVANCED.md#using-an-existing-playwright-config."
    );
  }

  const outputDir = resolveOutputDir(config);
  const auth = config.auth;

  const playwrightConfig: PlaywrightTestConfig = {
    testDir: config.testDir ?? DEFAULT_TEST_DIR,
    outputDir: `${outputDir}/test-results`,
    reporter: [["list"]],
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    timeout: config.timeout ?? 30_000,
    use: {
      baseURL,
      trace: "retain-on-failure",
      ...(auth?.httpCredentials ? { httpCredentials: auth.httpCredentials } : {}),
      ...(auth?.headers ? { extraHTTPHeaders: auth.headers } : {}),
    },
    metadata: {
      responsiveOverflow: {
        tier: resolveTier(config),
        baseURL,
        outputDir,
        storageState: authStoragePath(config),
      },
    },
  };

  if (config.startCommand) {
    playwrightConfig.webServer = {
      command: config.startCommand,
      url: baseURL,
      reuseExistingServer: config.reuseExistingServer ?? !process.env.CI,
      timeout: 120_000,
      // Agent-detection variables are stripped here — see resolveWebServerEnv.
      // Without this, a dev server that daemonizes under an agent exits
      // immediately and Playwright reports it as a startup crash.
      env: resolveWebServerEnv(config),
    };
  }

  return playwrightConfig;
}
