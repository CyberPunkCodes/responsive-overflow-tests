# Advanced configuration

Everything here goes in the same single file — `responsive-overflow-tests.config.ts`
at your project root. You should never need to edit the generated
`playwright.config.*` or `e2e/overflow.spec.*`.

New here? Start with the [README](README.md).

---

## Authentication

Testing an admin panel or dashboard means getting past a login. The session is
established **once**, before the suite runs, and reused for every
authenticated check — not re-entered per route.

Routes are split into two lists so public pages are still checked
logged-**out**, which is how real visitors see them:

```ts
export default defineConfig({
  port: 3000,
  startCommand: "npm run dev",

  routes: {
    light: ["/", "/pricing"],
  },

  authedRoutes: {
    light: ["/dashboard"],
    medium: ["/dashboard/settings", "/dashboard/billing"],
  },

  auth: { /* one of the four options below */ },
});
```

`authedRoutes` uses the same cumulative tier groups as `routes`.

### Option 1 — form login (most common)

The package drives a real browser through your login form once, then caches
the session to `.playwright/auth/state.json`.

```ts
auth: {
  login: {
    url: "/login",
    username: process.env.TEST_USER,
    password: process.env.TEST_PASS,
    successUrl: "/dashboard",
  },
},
```

Selectors are guessed from common markup. Override them if your form is
unusual:

```ts
auth: {
  login: {
    url: "/login",
    username: process.env.TEST_USER,
    password: process.env.TEST_PASS,
    usernameSelector: 'input[name="user_email"]',
    passwordSelector: 'input[name="user_password"]',
    submitSelector: 'button[data-testid="signin"]',
    successUrl: "/dashboard",
  },
},
```

Defaults if you omit them:

| Field | Default selector |
|---|---|
| `usernameSelector` | `input[type="email"]`, `input[name="email"]`, `input[name="username"]`, `input[id="email"]`, `input[id="username"]` |
| `passwordSelector` | `input[type="password"]` |
| `submitSelector` | `button[type="submit"]`, `input[type="submit"]` |

> **Never hardcode credentials.** Read them from environment variables, as
> above. This config file is committed to your repository.

Laravel note: if your login form posts a CSRF token, this works as-is —
the token is in the rendered page and the browser submits it like a user would.

### Option 2 — reuse a session you already have

If your project already produces a Playwright storage-state file:

```ts
auth: { storageState: "./.auth/user.json" },
```

### Option 3 — HTTP basic auth

For a staging environment behind a gate:

```ts
auth: {
  httpCredentials: {
    username: process.env.STAGING_USER,
    password: process.env.STAGING_PASS,
  },
},
```

This applies to **all** routes, since basic auth gates the whole site.

### Option 4 — token / header auth

```ts
auth: {
  headers: { Authorization: `Bearer ${process.env.TEST_TOKEN}` },
},
```

---

## Custom viewports

### Add to the built-in tiers

Most common — keep the defaults, add sizes you care about. Each custom
viewport is assigned to a tier like any other:

```ts
extraViewports: {
  light: [{ name: "kiosk", width: 1080, height: 1920 }],
  full: [{ name: "video-wall", width: 3840, height: 2160 }],
},
```

### Replace the built-ins entirely

When your design system doesn't use Tailwind's breakpoints:

```ts
viewports: {
  light: [
    { name: "phone", width: 375, height: 812 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "desktop", width: 1440, height: 900 },
  ],
  medium: [{ name: "phone-small", width: 320, height: 568 }],
  full: [{ name: "ultrawide", width: 3440, height: 1440 }],
},
```

### Use real device sizes instead of breakpoint widths

```ts
source: "devices",
```

Swaps the synthetic Tailwind widths for a curated matrix of current-generation
phones, foldables, tablets, and desktop sizes — same tier structure.

Viewports that resolve to identical dimensions are de-duplicated, so a custom
size that collides with a built-in won't run twice.

---

## Ignoring known offenders

Some overflow you don't control: an embedded map, an ad slot, a third-party
widget. Exclude them by selector:

```ts
ignore: ["#map-embed", ".ad-slot", "[data-widget='reviews']"],
```

An element matching one of these — **or nested inside one** — is dropped from
the offender list. If every element past the edge was ignored, the check
passes.

> **Caveat, stated plainly:** the overflow measurement itself is
> document-wide, so `ignore` works by *attribution*, not by suppressing the
> measurement. If an ignored element is the sole cause of the overflow, the
> check passes. If something else also overflows, you still get a failure —
> naming only the elements you can actually fix.

Prefer `ignore` over raising `tolerancePx`. Tolerance blinds the check
everywhere; `ignore` is surgical.

---

## Continuous integration

Run `light` locally, `full` in CI. The full tier is the widest viewport net
and the slowest — it belongs in a pipeline, not in your edit loop.

### GitHub Actions

```yaml
name: Responsive overflow

on:
  push:
    branches: [main]
  pull_request:

jobs:
  overflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - run: npx playwright test
        env:
          RESPONSIVE_TIER: full

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-artifacts
          path: .playwright/
          retention-days: 7
```

For a non-JS backend, add whatever boots your app before the test step, or
point `baseURL` at an already-deployed staging environment and drop
`startCommand`.

### Testing a deployed environment

```ts
export default defineConfig({
  baseURL: process.env.STAGING_URL ?? "https://staging.example.com",
  routes: { light: ["/", "/about"] },
});
```

With no `startCommand`, nothing is booted — it just hits the URL.

### Artifacts

Everything Playwright writes goes under `.playwright/` — one directory, one
gitignore line, added for you by `init`. A passing run leaves only a small
bookkeeping file there; traces and error context are retained on failure only.
Nothing ever lands outside that directory, and it is gitignored, so it can't
turn up unnoticed in a commit.

---

## AI agents & automated workflows

If an AI coding agent works in this repository, point it at this section. Copy
the block below into your `AGENTS.md` or `CLAUDE.md`:

```md
## Responsive overflow checks

This project uses `responsive-overflow-tests`. Configuration is in
`responsive-overflow-tests.config.ts` at the project root — that is the only
file to edit. Do not edit `playwright.config.*` or `e2e/overflow.spec.*`.

Which tier to run:

- After any edit touching HTML, templates, views, CSS, or layout components:
  `npx playwright test`  (light — fast, every Tailwind breakpoint)
- After a significant layout change — new component, restructured page,
  changed grid/flex behaviour, before merging:
  `RESPONSIVE_TIER=medium npx playwright test`
- Do NOT run the full tier on your own initiative. It is the widest net and
  the slowest. Recommend to the user that it run in CI instead.

When a check fails:
- The failure names the offending elements. Fix the element.
- Do NOT raise `tolerancePx` to make a failure pass.
- Do NOT add a selector to `ignore` unless the element is genuinely
  third-party and unfixable.

When adding a new page, add its route to `responsive-overflow-tests.config.ts`
— `light` if it is a primary page, otherwise `medium` or `full`.
```

The reasoning behind the tiers: `light` is fast enough to run constantly,
`medium` costs more but catches the breakpoint-boundary breaks that matter
before a merge, and `full` is a pre-release sweep. An agent that runs `full`
after every edit is burning time for coverage nobody asked for.

---

## Troubleshooting

### `Error: connect ECONNREFUSED` on every route

Nothing is serving your site. Either set `startCommand` so Playwright boots it,
or start the server yourself and make sure `port`/`baseURL` matches. If you
merged into an existing Playwright config, the `webServer` block there is what
matters.

### `browserType.launch: Executable doesn't exist`

The browser binary was never downloaded — the runner and the browser install
separately:

```bash
npx playwright install chromium
```

### `Error: No tests found`

Three usual causes:

1. **Your active tier has no routes.** Routes in `medium`/`full` don't run on a
   `light` run. Check which group they're in, or run
   `RESPONSIVE_TIER=medium npx playwright test`.
2. **The spec isn't under `testDir`.** Playwright only discovers specs beneath
   it — `e2e/` by default.
3. **A `-g` filter that matches nothing.** Match on `horizontal overflow`;
   every generated title contains it.

### Everything fails at every viewport, including `/`

Usually the whole page is genuinely wider than the viewport — a fixed-width
wrapper, a `100vw` element inside padding, or a stray `min-width`. Read the
offender list in the failure; it names the element. If the offender is
`html`/`body` with no children listed, look for horizontal margin or padding on
those elements.

### A third-party embed I can't fix keeps failing

Use [`ignore`](#ignoring-known-offenders), not `tolerancePx`.

### Failures point into `node_modules`

Your spec is calling a helper that registers tests internally. The generated
spec owns the `test()` loop for exactly this reason — see
[Writing your own spec](#writing-your-own-spec).

### `Cannot use 'import.meta' outside a module` / ESM errors

You're on a version before 0.3.0. Upgrade — see the
[changelog](CHANGELOG.md#030).

### The login runs but authenticated routes still fail

- Confirm `auth.login.successUrl` matches where your app actually lands after
  sign-in; without it, a failed login looks like a success.
- Credentials come from environment variables — make sure they're set in the
  shell running the tests, not just in a `.env` your app reads.
- Delete `.playwright/auth/` to force a fresh login; a cached session may have
  expired.

### The test account keeps getting locked out

Login throttling plus parallel workers. Since 0.3.0 only one worker performs
the login while the rest wait, but if you're seeing this anyway, pre-generate a
session and point at it with `auth.storageState`, or run the suite with
`--workers=1`.

### Runs are slow

Check `waitUntil`. If you set it to `networkidle`, every route waits for
network silence, which never arrives on sites with polling or analytics. The
default `"load"` is almost always what you want. Also confirm you're not
running `full` by habit — that's a CI tier.

### `.playwright/` showed up in my commit

`init` adds it to `.gitignore`, but that won't help if it was committed before
the ignore rule existed:

```bash
git rm -r --cached .playwright
```

---

## Config reference

Every option, in one place.

**A note on the "Applies when" column.** Some options exist only to build a
Playwright config for you. If you keep your own `playwright.config.*` and just
import this config for its routes (see
[Using an existing Playwright config](#using-an-existing-playwright-config)),
those options are **silently unused** — your Playwright config already owns
that ground. Options marked *always* work either way.

### Where the site is served

These are consumed by `toPlaywrightConfig()` only.

| Option | Type | Default | Notes |
|---|---|---|---|
| `port` | `number` | — | Local server port. Needed unless `baseURL` is set. |
| `host` | `string` | `"localhost"` | |
| `baseURL` | `string` | — | Full URL. Use instead of `port`/`host` for a deployed site. Also used as the login context's base when `auth.login` is set. |
| `startCommand` | `string` | — | Boots the site. Omit if it's already running. |
| `reuseExistingServer` | `boolean` | `true` outside CI | Attach to a running server instead of booting one. |

### What to check

| Option | Type | Default | Applies when | Notes |
|---|---|---|---|---|
| `routes` | `string[]` or tier groups | — | always | **Required.** Flat array = every tier. |
| `authedRoutes` | `string[]` or tier groups | — | always | Requires `auth`. |
| `auth` | object | — | always | See [Authentication](#authentication). |

### Viewports

| Option | Type | Default | Applies when | Notes |
|---|---|---|---|---|
| `source` | `"breakpoints"` \| `"devices"` | `"breakpoints"` | always | Custom sizes go in `viewports`/`extraViewports`. |
| `viewports` | tier groups | — | always | Replaces the built-ins. |
| `extraViewports` | tier groups | — | always | Adds to the built-ins. |

### Run behaviour

| Option | Type | Default | Applies when | Notes |
|---|---|---|---|---|
| `tier` | `"light"` \| `"medium"` \| `"full"` | `"light"` | always | `RESPONSIVE_TIER` env var wins. |
| `tolerancePx` | `number` | `1` | always | Absorbs sub-pixel rounding. Raising this is usually the wrong fix. |
| `waitUntil` | `"load"` \| `"domcontentloaded"` \| `"networkidle"` \| `"commit"` | `"load"` | always | `networkidle` can hang on sites with polling or analytics. |
| `expectStatus` | `number` \| `false` | `200` | always | `false` skips the status check. |
| `ignore` | `string[]` | `[]` | always | See [Ignoring known offenders](#ignoring-known-offenders). |
| `timeout` | `number` | `30000` | `toPlaywrightConfig` only | Per check, in ms. |
| `outputDir` | `string` | `".playwright"` | `toPlaywrightConfig` only | All artifacts land here. Also where the login session is cached. |
| `testDir` | `string` | `"e2e"` | `toPlaywrightConfig` only | Where Playwright discovers the spec. |

---

## Using an existing Playwright config

If you already have `playwright.config.*`, `init` won't touch it. Three ways to
connect them, easiest first.

**Keep your Playwright config, use ours for routes only** — the usual case when
you already have a working suite. Your config keeps owning `baseURL`,
`webServer`, projects, and workers; ours contributes nothing but routes and
coverage. Leave `port`/`startCommand` out of it entirely:

```ts
// responsive-overflow-tests.config.ts
import { defineConfig } from "responsive-overflow-tests";

export default defineConfig({
  routes: {
    light: ["/", "/about"],
    medium: ["/terms", "/privacy"],
  },
});
```

Then point the spec at it from wherever your tests live, and delete the
generated `playwright.config.*` shim:

```ts
// tests/overflow.spec.ts
import { test } from "@playwright/test";
import { overflowCases, runOverflowCheck } from "responsive-overflow-tests";
import config from "../responsive-overflow-tests.config";

for (const testCase of overflowCases(config)) {
  test(testCase.title, async ({ page }) => {
    await runOverflowCheck(page, testCase, config);
  });
}
```

Nothing else is needed — routes resolve against your existing `use.baseURL`.
If you filter runs with `-g`, match on `horizontal overflow`, which every
generated test title contains.

**Wrap your export** — if the existing config has no settings you need to keep:

```ts
import { toPlaywrightConfig } from "responsive-overflow-tests";
import config from "./responsive-overflow-tests.config";

export default toPlaywrightConfig(config);
```

**Merge by hand** — if you have other Playwright suites to preserve. Make sure
your config's `testDir` includes the generated spec, and that `baseURL` and
`webServer` point at your site:

```ts
import { defineConfig } from "@playwright/test";
import { toPlaywrightConfig } from "responsive-overflow-tests";
import overflowConfig from "./responsive-overflow-tests.config";

const generated = toPlaywrightConfig(overflowConfig);

export default defineConfig({
  ...generated,
  testDir: "./tests",          // your existing test directory
  projects: [
    { name: "unit", testMatch: /unit\/.*\.spec\.ts/ },
    { name: "overflow", testMatch: /overflow\.spec\.ts/ },
  ],
});
```

If your test directory isn't `e2e/`, either move the generated spec into it or
set `testDir` in `responsive-overflow-tests.config.ts` to match.

---

## Writing your own spec

The generated stub is the reference implementation, and there is deliberately
only one pattern:

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

The loop lives in **your** file on purpose. An earlier version of this package
exposed a one-call `defineOverflowTests(config)` helper that registered the
tests internally — convenient, but it meant Playwright attributed every
failure to a line inside `node_modules` instead of to your spec. That helper
was removed rather than kept alongside this: one way to do it, with usable
failure output.

### Lower-level exports

```ts
import {
  overflowReport,      // (page, ignore?) → the raw DOM measurement
  overflowCases,       // (config) → public route × viewport cases
  authedOverflowCases, // (config) → login-gated cases
  runOverflowCheck,    // (page, case, config) → performs one check
  createAuthedPage,    // (browser, config) → page carrying the session
  ensureAuthSession,   // (browser, config) → log in once, cache the session
  toPlaywrightConfig,  // (config) → a Playwright config object
  authStoragePath,     // (config) → where the session is cached
  resolveRoutes,       // (config, tier?) → routes for that tier
  resolveViewports,    // (config, tier?) → viewports for that tier
  BREAKPOINT_TIERS,
  DEVICE_TIERS,
  cumulative,
} from "responsive-overflow-tests";
```

`createAuthedPage` owns a fresh browser context — close it when done
(`await page.context().close()`), as the generated spec does.

---

MIT © CyberPunk
