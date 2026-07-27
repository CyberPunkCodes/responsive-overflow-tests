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

## Routes that do something

Every check is a real page load in a real browser. That is the whole point — it
is why the measurement is trustworthy — but it means a route with side effects
will have them, once per viewport, on every run.

A `light` run visits six viewports. Adding your checkout page to it is six page
loads, which may be six payment intents, six analytics sessions, or six rows in
a table. In CI, against an environment holding live credentials, that stops
being a test-data problem.

Most sites never hit this. If yours has a checkout, a booking flow, a
transactional-mail trigger, or anything that writes on load, three habits keep it
safe.

### Point it at an environment that can't do damage

The cleanest fix by far. Run against local or staging, with test-mode keys and a
throwaway database. If a route is only reachable in an environment with real
credentials, don't list it.

### Block the endpoints that mutate

Playwright can abort requests before they leave the browser. Do it in your spec,
around the check:

```ts
import { test } from "@playwright/test";
import { overflowCases, runOverflowCheck } from "responsive-overflow-tests";
import config from "../responsive-overflow-tests.config";

// Anything that writes. Aborted before it leaves the browser.
const MUTATING_ENDPOINTS = ["**/api/checkout", "**/api/subscribe", "**/webhooks/**"];

for (const testCase of overflowCases(config)) {
  test(testCase.title, async ({ page }) => {
    for (const endpoint of MUTATING_ENDPOINTS) {
      await page.route(endpoint, (route) => route.abort());
    }
    await runOverflowCheck(page, testCase, config);
  });
}
```

The layout still renders and still gets measured; the write never happens. If a
blocked call is what populates the part of the page you care about, feed it a
stub with `route.fulfill()` instead of aborting.

### Assert you are where you think you are

The failure mode that actually costs money is a config or CI variable quietly
resolving to production. Assert against it in the test itself, so a
misconfiguration fails loudly instead of running:

```ts
import { test, expect } from "@playwright/test";
import config from "../responsive-overflow-tests.config";

test.beforeAll(() => {
  const target = config.baseURL ?? `localhost:${config.port}`;
  expect(
    /localhost|127\.0\.0\.1|staging/.test(target),
    `Refusing to run: ${target} does not look like a test environment.`
  ).toBe(true);
});
```

If your app exposes its publishable/public keys to the page — payment providers
commonly do — read one and assert it isn't the live one. It is a cheap check and
it catches the case where every other signal looked right.

> Keep these guards in your own spec, not in the config. This package
> deliberately has no "don't really do that" mode: it can't know which of your
> requests are safe, and a knob that *looked* like it protected you would be
> worse than none.

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

The escalation that works in practice:

| Where | Tier | Why |
|---|---|---|
| While editing | `light` | Seconds. Cheap enough to run constantly. |
| Before merging a branch | `medium` | Adds the breakpoint-boundary widths, where overflow actually happens. |
| CI | `full` | The widest net, on a machine whose time you aren't waiting on. |

### Git hooks — catching it before it leaves your machine

Put `light` on **pre-push**, not pre-commit. A commit should stay instant, and
it's normal to commit work-in-progress that doesn't pass yet; a push is the
point where it starts affecting other people. This is also the last gate before
CI, so it saves you a red pipeline for something a four-second check would have
caught.

With [husky](https://typicode.github.io/husky/):

```bash
npm install --save-dev husky
npx husky init
echo 'npx playwright test' > .husky/pre-push
```

With [lefthook](https://lefthook.dev/), in `lefthook.yml`:

```yaml
pre-push:
  commands:
    responsive:
      run: npx playwright test
```

Or with no dependency at all — `.git/hooks/pre-push`, made executable with
`chmod +x` (note this one is local to your clone and isn't shared with the
team):

```bash
#!/bin/sh
npx playwright test || exit 1
```

Bypass a hook when you genuinely need to with `git push --no-verify`.

Two things to get right:

- **Scope the hook to this check** if your suite has slower layers. Use the
  script from step 6 of the README (`npm run test:responsive`) or filter with
  `npx playwright test -g "horizontal overflow"` — every generated test title
  contains that phrase.
- **Don't raise the tier in the hook.** `medium` and `full` are slow enough
  that people start reaching for `--no-verify` out of habit, which costs you
  the hook entirely.

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

Two things worth checking before you turn this on in a pipeline:

- **What the job's secrets actually are.** CI is where a "staging" variable
  quietly resolves to production, and `full` multiplies every page load by
  eighteen viewports. If any listed route has side effects, read
  [Routes that do something](#routes-that-do-something) first.
- **`RESPONSIVE_TIER` is set in the job**, not left to the config default. The
  default is `light`; a CI run that silently checks six viewports instead of
  eighteen looks identical in the log.

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

To check a layout, run this. Do NOT write a throwaway Playwright script with
your own viewports — this is that check, already configured and agreed on. If
the coverage is wrong, change the config so the fix persists.

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

Each check is a real page load, repeated once per viewport. Do NOT add a route
that charges a card, sends mail, or writes data without saying so first — six
loads of a checkout page is six of whatever that page does.

Never point the suite at production. It runs against local or staging.

This check only proves the layout did not physically overflow. It cannot see
overlap, bad wrapping, or unreadable spacing — those fit inside the viewport
and pass. After a visual change, also run a screenshot pass and look at the
output. A green run here is not evidence the page looks right.
```

The reasoning behind the tiers: `light` is fast enough to run constantly,
`medium` costs more but catches the breakpoint-boundary breaks that matter
before a merge, and `full` is a pre-release sweep. An agent that runs `full`
after every edit is burning time for coverage nobody asked for.

The "don't write your own" line earns its place. Asked to verify a layout, an
agent will reach for a one-off Playwright script by default — with viewports it
chose that session, discarded afterwards. Across projects that leaves no shared
baseline and no way to tell a regression from a differently-measured page. The
config file is the point: coverage decided once, in the repo, the same
everywhere, changeable by a human.

That last paragraph matters more for agents than for people. An agent that has
just been told "no horizontal overflow at 15 viewports" will happily report the
layout as verified, because the check it ran came back clean. It didn't look at
anything. If you use Claude Code,
[`frontend-screenshot-verification`](https://github.com/CyberPunkCodes/claude-dev-plugins/tree/main/plugins/frontend-screenshot-verification)
is a plugin that renders routes across real device viewports for exactly that
second pass — but any screenshot tool works, as long as something exercises
judgment. See [Pair it with a screenshot pass](README.md#pair-it-with-a-screenshot-pass).

---

## Troubleshooting

### `Error: connect ECONNREFUSED` on every route

Nothing is serving your site. Either set `startCommand` so Playwright boots it,
or start the server yourself and make sure `port`/`baseURL` matches. If you
merged into an existing Playwright config, the `webServer` block there is what
matters.

### `Process from config.webServer exited early`

Your `startCommand` returned instead of staying in the foreground. Playwright
needs the process it spawns to *be* the server, so it can wait for the port and
kill it afterwards.

The usual cause is a dev server that daemonizes — it forks a background process
and exits immediately, so from Playwright's point of view the server died on
startup. Some CLIs do this by default; some do it only on a second invocation,
where a background instance from an earlier run is still holding the project and
the new one hands off to it and exits.

Three fixes, best first:

1. **Serve a build instead of the dev server.** `npm run build && npm run
   preview` (or your framework's equivalent) runs in the foreground, boots
   faster, and — more importantly — tests the output you actually ship. Dev
   servers inject overlays and unminified assets that a production build won't
   have.
2. **Stop the stray background instance first**, if your CLI has a command for
   it, then let Playwright start a fresh one.
3. **Start the server yourself** in another terminal and drop `startCommand`
   entirely. Playwright will attach to it.

### The run is green but I know that page is broken

You almost certainly measured a different server than you meant to. Outside CI,
`reuseExistingServer` defaults to `true`: if something is already listening on
your port, Playwright attaches to it and never runs `startCommand`. When that
port is your framework's default, "something" is usually your own `npm run dev`
— on another branch, or serving a build from an hour ago.

Serve the tests on a port you use for nothing else, referenced in both `port`
and `startCommand`. Then the two can't collide, and a failure to boot is loud
instead of silent.

To confirm what you're hitting, load the route yourself at the port in your
config, or set `reuseExistingServer: false` for a run and see whether the result
changes.

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

### Runs are slow, or tests run one at a time

If you merged into an existing Playwright config, check its top-level `workers`
first — that's the usual answer, and a per-project `fullyParallel: true` does
not override it. See the note in
[Using an existing Playwright config](#using-an-existing-playwright-config).

Otherwise check `waitUntil`. If you set it to `networkidle`, every route waits
for network silence, which never arrives on sites with polling or analytics. The
default `"load"` is almost always what you want. Also confirm you're not running
`full` by habit — that's a CI tier.

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

> **Check your `workers` before you blame the package.** This is the one thing
> that reliably surprises people here. Overflow checks are independent and
> should run in parallel — dozens of them finish in seconds. But **`workers` and
> `fullyParallel` are not the same setting, and only `fullyParallel` can be set
> per project.** A config with a top-level `workers: 1` — completely normal if
> your existing suite has serial database or checkout tests — serializes
> *everything*, including this, and no per-project option can raise it back:
>
> ```ts
> export default defineConfig({
>   workers: 1,                    // top-level: applies to every project
>   projects: [
>     { name: "e2e", testDir: "./tests/e2e" },
>     { name: "overflow", testDir: "./tests/overflow", fullyParallel: true },
>     //                                              ↑ does NOT restore parallelism
>   ],
> });
> ```
>
> Give the overflow project its own script and set the worker count there:
>
> ```json
> { "scripts": { "test:responsive": "playwright test --project=overflow --workers=4" } }
> ```
>
> Your serial suite keeps `workers: 1` from the config; this one gets its
> parallelism back from the command line. Symptom to watch for: a run that works
> fine but takes minutes instead of seconds.

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
