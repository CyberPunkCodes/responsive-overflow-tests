# Changelog

This project is pre-1.0. Per semver, breaking changes may land in a minor
release; they are always listed here first.

## 0.4.1

Both changes came out of running 0.4.0 against real projects for the first time.

### Fixed

- **Carousels no longer report as clipped.** Elements whose computed `position`
  is `absolute` or `fixed` are skipped. A coverflow/slider track parks its
  off-screen slides outside a clipping stage on purpose — that is the effect,
  not a defect — and since sliders are usually `<ul><li>`, the default selector
  flagged every slide at every viewport. Accidental clipping, the thing worth
  reporting, is a flow-layout phenomenon. `sticky` stays in flow and is still
  checked.

- **Clipped text in a block-level element is now detected.** The check compared
  an element's box against its clipping ancestor, which only catches
  shrink-to-fit elements (flex/grid/inline-block children). A block-level `h2`
  is always exactly as wide as its container, so `white-space: nowrap` text
  spilling out of it never moved the element's rect and went unreported. The
  element's own `scrollWidth` vs `clientWidth` is now considered too, skipped
  when the element scrolls itself.

  This one was found by a test written for the `position` fix above, which
  failed for a reason unrelated to what it was testing.

## 0.4.0

### Added

- **Clipped-overflow detection.** The `scrollWidth` check is blind to overflow
  that an ancestor cuts off: with `overflow-x: hidden` anywhere up the tree, a
  child wider than that ancestor is truncated instead of scrolled, so
  `scrollWidth` never exceeds `clientWidth` and the page passes while visibly
  losing text. Each candidate element is now also compared against the box of
  the nearest ancestor that clips it — the same kind of deterministic
  measurement as the primary check, no screenshots, nothing to adjudicate.

  Only `overflow-x: hidden` and `clip` count. `auto` and `scroll` are excluded
  on purpose: that content is still reachable, so a carousel or a scrollable
  table is not a defect.

- `clippedReport()` and `DEFAULT_CLIPPING_SELECTOR` are exported for anyone
  driving the primitives directly.

- **`webServerEnv`** — environment overrides for the `startCommand` process,
  layered over `process.env`. Set a key to `undefined` to remove it.

### Changed

- **Clipping detection is on by default.** It checks text-bearing block
  elements (`h1`–`h6`, `p`, `li`, `blockquote`, `figcaption`, `table`, `pre`,
  `dt`, `dd`) — where clipping actually destroys information — and skips
  `div`/`span`/`a`/`img`, since a full-bleed decorative element inside an
  `overflow-hidden` wrapper is a normal pattern rather than a bug.

  **A previously green project can go red on upgrade.** That is the point: the
  failure was always there and was invisible. To opt out, `clipping: false`; to
  narrow it, `clipping: { selector: "h1, h2" }`; to excuse specific elements,
  `clipping: { ignore: [".marquee"] }` or the top-level `ignore`, which it
  inherits.

- **Agent-detection environment variables are blanked for the `startCommand`
  process.** Several dev servers change behaviour when they believe an AI agent
  launched them — Astro 7.1+ forks into a background daemon, so the wrapper
  exits immediately and Playwright reports `Process from config.webServer exited
  early` even though the server is up and answering. Neutralising the signal
  makes a run behave the same whether a human or an agent started it, which is
  the only way the result means the same thing in both cases. The list is
  exported as `AGENT_ENV_VARS`; put one back with
  `webServerEnv: { CLAUDECODE: "1" }`.

  They are set to `""` rather than removed, because Playwright *merges*
  `webServer.env` over `process.env` and a key cannot be deleted from it.
  Detection libraries treat an empty value as absent (`am-i-vibing` returns
  `null` for `CLAUDECODE=`), and unlike `env -u` this works on Windows.

  Deliberately framework-agnostic — it neutralises the signal rather than
  special-casing any one dev server.

### Fixed

- Releases are now tagged `vX.Y.Z` and the tags are pushed. 0.3.2 was published
  to npm but never pushed to GitHub, and with no tags nothing made that visible.
  Tags were added retroactively for every published version except 0.1.1, whose
  version bump never landed as its own commit.

## 0.3.2

Documentation only — no API change, no behaviour change in the check itself.
Everything below came out of rolling the package onto real projects.

### Added

- **A plain-English opening to the README.** States what the package does and
  what horizontal overflow is before any API appears, then a **Why** section:
  the bug renders fine on a desktop monitor so it survives review, mobile is
  what Google indexes, and WCAG 2.1 criterion 1.4.10 (Reflow, AA) is written
  against a 320px width.
- **A "For AI coding agents" section** in the README. Beyond the obvious (an
  agent editing layout code can't see the result), it names the drift problem:
  asked to verify a layout, an agent writes a one-off Playwright script with
  viewports it picked that session and discards it, so across projects there is
  no shared baseline and no way to tell a regression from a differently-measured
  page. Also why the tiers are the answer to cost — `light` returns two lines of
  text, so an agent can run it on small edits without feeding screenshots back
  through a model or re-deriving a harness.
- **"Do not write a throwaway Playwright script"** in the copy-paste agent
  guidance block, with the reasoning below it.
- **"Routes that do something"** (ADVANCED) — checks are real page loads,
  repeated once per viewport, so a checkout or mail-triggering route does its
  thing six to eighteen times per run. Covers pointing at a safe environment,
  aborting mutating endpoints with `page.route()`, and asserting in-test that
  you aren't on production.
- **A `workers` warning** in the existing-config merge section. `workers` is
  top-level in Playwright and `fullyParallel: true` on a project does not
  override it, so merging into a config with `workers: 1` silently serializes
  the overflow run. Fix is `--workers=N` on that project's script.
- **Port guidance** in the README and troubleshooting. Outside CI,
  `reuseExistingServer` attaches to whatever already holds the port — if that's
  your framework's default, the suite can quietly measure your own dev server on
  another branch and pass.
- **Troubleshooting: `Process from config.webServer exited early`** — dev
  servers that daemonize return immediately and look like a crashed server.
  Serve a build, stop the background instance, or start it yourself.
- **A note that `RESPONSIVE_TIER` should be explicit in CI**, since a job that
  silently runs `light` looks identical in the log to one running `full`.
- Two lines in the copy-paste agent guidance block: don't add side-effecting
  routes without asking, and never point the suite at production.
- Docs rules in this repo's `AGENTS.md`, including that any file `init` tells an
  agent to read from `node_modules/` must be listed in `files`.

### Changed

- README "Getting started" now flags the existing-Playwright-config path up
  front rather than only in the step-3 table.
- Expanded `keywords` in `package.json` for npm search.

### Fixed

- The `submitSelector` and `usernameSelector` JSDoc in `types.ts` understated
  the actual defaults. Corrected against `auth.ts`; the ADVANCED table was
  already right.

## 0.3.1

Documentation and `init` output only — no API change, no behaviour change in
the check itself.

### Added

- **`init` now prints the one-line prompt** that tells an AI coding agent to
  write the tier guidance into the project's own `AGENTS.md`/`CLAUDE.md`.
  `ADVANCED.md` ships inside the package, so the agent reads it locally with no
  network access. Nothing new is written to disk — it is printed, not scaffolded.
- **README step 7, "Tell your AI agent about it"** — the same prompt, at the
  point in the setup sequence where it is actionable. Agents do not discover
  the guidance on their own; someone has to point at it once.
- **Git hook guidance** in the CI section: `light` on **pre-push**, with husky,
  lefthook, and plain `.git/hooks` examples, plus why pre-commit is the wrong
  place and why raising the tier in a hook backfires.
- **Cross-references to a screenshot pass** in the README, the agent guidance
  block, and `init` output. This check proves a layout did not physically
  break; it cannot judge overlap, wrapping, or spacing, and an agent that only
  runs this will report a page as verified without having looked at it.

### Changed

- The CI section now states the full escalation (`light` while editing,
  `medium` before merging, `full` in CI) as a table rather than one sentence.

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
