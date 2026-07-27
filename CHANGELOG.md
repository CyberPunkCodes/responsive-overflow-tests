# Changelog

This project is pre-1.0. Per semver, breaking changes may land in a minor
release; they are always listed here first.

## 0.3.0

A substantial rework around a **single config file**. If you are on 0.1.x or
0.2.0, read the migration note below — this release removes the old API.

### Added

- **One config file at the project root**, `responsive-overflow-tests.config.ts`
  (or `.js`/`.mjs`), created by `init` and the only file you edit. Holds the
  server details, routes, viewports, auth, and run behaviour.
- **`defineConfig()`** with validation that fails fast and readably instead of
  surfacing as a confusing Playwright error mid-run.
- **`toPlaywrightConfig()`** — turns your config into a Playwright config, so
  the generated `playwright.config.*` is a three-line shim.
- **Tier-grouped routes.** `routes` accepts `{ light, medium, full }`, so the
  tier now scales *routes and viewports together*. A flat array still works and
  means "every tier."
- **Authentication** for pages behind a login (`authedRoutes` + `auth`), via
  form login, an existing storage-state file, HTTP basic auth, or headers.
  Public routes are still checked logged-out.
- **`extraViewports`** to add to the built-in tiers, and `viewports` to replace
  them wholesale — both tier-keyed.
- **`ignore`** — CSS selectors for third-party embeds you can't fix.
- **`init` improvements:** detects TypeScript vs JavaScript, refuses to
  overwrite anything, appends `.playwright/` to `.gitignore`, and prints merge
  instructions when a `playwright.config.*` already exists.
- `AGENTS.md` plus an AI-agent section in `ADVANCED.md` describing which tier to
  run when.
- `CHANGELOG.md` (this file), `engines`, `bugs`, and `homepage` metadata.

### Changed

- **`light` is now exactly the Tailwind v4 breakpoints** (640/768/1024/1280/1536)
  plus a 360px phone width — 6 viewports, up from 4. It previously missed `lg`
  and `2xl`, so the default tier did not actually cover every breakpoint.
- **`medium` adds the one-px-below boundary widths** (639/767/1023/1279/1535).
  Tailwind breakpoints are `min-width`, so those widths are where the smaller
  layout is stretched widest — the highest-yield widths for overflow.
- **`waitUntil` now defaults to `"load"`, not `"networkidle"`.** Playwright
  discourages `networkidle`; it can hang on any site with polling or analytics.
  In practice this also made runs several times faster.
- **All artifacts are consolidated under `.playwright/`** — `test-results`,
  reports, and the cached session. One line to gitignore, nothing written
  outside it.
- Reporter defaults to `list` and traces to `retain-on-failure`, so a passing
  run leaves no meaningful artifacts behind.

### Removed — breaking

- **`defineOverflowTests()`**. It registered tests from inside the package,
  which made Playwright attribute every failure to a line in `node_modules`
  instead of to your spec. The generated spec now owns the `test()` loop.
- **`OverflowTestOptions`** — use `ResponsiveConfig`.
- **`source: Viewport[]`** — supply custom sizes via `viewports` or
  `extraViewports`, which are tier-aware.
- **`label`** — it no longer had anything to name.

### Fixed

- **The package failed to load in any project that isn't ESM.** Playwright
  transpiles imported modules to CommonJS for such projects, and the package
  used `import.meta.url`, which is a parse-time syntax error under CJS. All
  uses are gone and a unit test now enforces their absence.
- Parallel workers no longer each perform their own login. The first worker
  takes a lock and the rest wait for the session, so apps that throttle logins
  (Laravel does by default) don't lock the test account mid-run.
- The build now cleans `dist/` first, so files from deleted sources stop
  shipping.

### Migrating from 0.1.x / 0.2.0

Your spec almost certainly looks like this:

```ts
import { defineOverflowTests } from "responsive-overflow-tests";

defineOverflowTests({ routes: ["/", "/about"] });
```

Fastest path — delete that spec and run `npx responsive-overflow-tests init`,
then move your routes into the generated config.

To migrate by hand, create `responsive-overflow-tests.config.ts` at the project
root:

```ts
import { defineConfig } from "responsive-overflow-tests";

export default defineConfig({
  port: 3000,
  startCommand: "npm run dev",
  routes: { light: ["/", "/about"] },
});
```

and replace the spec body with the loop:

```ts
import { test } from "@playwright/test";
import { overflowCases, runOverflowCheck } from "responsive-overflow-tests";
import config from "../responsive-overflow-tests.config";

for (const testCase of overflowCases(config)) {
  test(testCase.title, async ({ page }) => {
    await runOverflowCheck(page, testCase, config);
  });
}
```

Two things to check afterwards:

- If you filter runs with `-g`, the old `describe` block is gone. Match on
  `horizontal overflow`, which every generated test title contains.
- Expect more checks per route — `light` went from 4 viewports to 6.

## 0.2.0

- Added `responsive-overflow-tests init` to scaffold Playwright wiring.
- Rewrote the README as a from-scratch setup guide.

## 0.1.0

- Initial release: `defineOverflowTests()`, breakpoint and device viewport
  tiers, and the DOM-measurement overflow check.
