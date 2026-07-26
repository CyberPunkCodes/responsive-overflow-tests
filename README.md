# responsive-overflow-tests

Framework-agnostic Playwright tests that catch horizontal-overflow layout
breaks — the "page is wider than the viewport" bug — across Tailwind
breakpoints and real-device viewports. No screenshots, no image diffing, no
AI in the loop.

## Why not visual/screenshot testing?

Visual regression tools compare pixels and need a human (or a model) to
judge whether a diff is a real break or just noise (font rendering, animation
timing, a new blog post title). This package does neither. It is
**deterministic DOM measurement**: at each viewport it reads
`document.documentElement.scrollWidth` vs. `clientWidth` in the page itself.
If the document is wider than the viewport, something overflowed — full
stop, no judgment call. That makes it safe to run unattended in CI on every
push: no baseline images to maintain, no human/AI review step, no flakiness
from pixel diffing.

On failure, it also walks the DOM for the elements whose bounding boxes
actually cross the right edge and reports the worst offenders (tag, id,
class, right-edge position, width) so you're not stuck bisecting the page by
hand.

## Getting started from scratch

If your project doesn't already have Playwright wired up, here's the whole
path from a bare repo to a green run. Skip whichever steps you've already
done.

### 1. Install the package + its peer dependency

`@playwright/test` is a **peer dependency** — it isn't pulled in for you, so
install both:

```bash
npm install --save-dev responsive-overflow-tests @playwright/test
```

### 2. Install a browser

Playwright drives real browser binaries, which are separate from the npm
package. Chromium alone is enough here:

```bash
npx playwright install chromium
```

### 3. Add a `playwright.config.ts` (with `baseURL` **and** `webServer`)

This is the step bare projects miss. Playwright needs two things: a
`baseURL` your route paths resolve against, and — unless you boot the site
yourself — a `webServer` block so Playwright starts your dev/preview server
before the tests and shuts it down after. Without `webServer`, every route
fails with connection-refused.

Fastest path: run `npx responsive-overflow-tests init` (see
[Zero-config scaffolding](#zero-config-scaffolding-init)) to drop this file
in for you. Or create `playwright.config.ts` at the project root by hand:

```ts
import { defineConfig } from "@playwright/test";

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
```

Adapt `webServer.command` and the two `url`s to how your project serves
locally — they must point at the same host/port:

| Stack | `command` | `url` |
|---|---|---|
| Astro (dev) | `npm run dev` | `http://localhost:4321` |
| Astro (built preview) | `npm run build && npm run preview` | `http://localhost:4321` |
| Next.js (dev) | `npm run dev` | `http://localhost:3000` |
| Plain static build | `npx http-server ./dist -p 8080` | `http://localhost:8080` |

`reuseExistingServer: !process.env.CI` lets Playwright attach to a server you
already have running locally, while always booting a fresh one in CI.

### 4. Add the routes config at your project root

The list of routes to guard lives in **one plain file at your project root**,
`responsive.routes.ts` — this is the only file you edit per site. Create it:

```ts
// Routes checked by the responsive-overflow gate. Edit this list — it is the
// only thing you change per site.
export const responsiveRoutes = [
  "/",
  "/about",
  "/pricing",
];
```

Keeping routes in a root-level config (rather than inline in the spec) means
the thing you actually maintain per project is a flat, obvious list — no
Playwright boilerplate around it, easy to eyeball in a diff, and the spec
never has to change.

### 5. Add a stub spec that imports it

Playwright discovers `*.spec.ts` files under `testDir` (`./e2e` in the config
above). Create `e2e/overflow.spec.ts` as a thin stub that imports the root
routes file and hands it to `defineOverflowTests`:

```ts
import { defineOverflowTests } from "responsive-overflow-tests";
import { responsiveRoutes } from "../responsive.routes";

defineOverflowTests({
  label: "responsive overflow",
  routes: responsiveRoutes,
});
```

The `../` climbs out of `e2e/` up to the project root where
`responsive.routes.ts` lives. `defineOverflowTests` calls Playwright's
`test.describe()`/`test()` under the hood, so it must run at module load
inside a spec file — not inside another `test()` or a helper you import
lazily.

### 6. Run it

With your routes listed in `responsive.routes.ts`, run:

```bash
npx playwright test
```

You'll get one test per route × viewport combination, each titled like:

```
no horizontal overflow — /pricing @ md-768 (768px)
```

## Zero-config scaffolding (`init`)

To skip steps 3, 4, and 5, run:

```bash
npx responsive-overflow-tests init
```

It writes three files, creating each only if it's absent:

| File | What it is |
|---|---|
| `playwright.config.ts` (project root) | Starter config with `baseURL` + `webServer`. |
| `responsive.routes.ts` (project root) | The routes list — **the only file you edit per site.** Seeded with a couple of placeholder routes. |
| `e2e/overflow.spec.ts` | Thin stub that imports `responsiveRoutes` from the root config and calls `defineOverflowTests`. |

It's **non-destructive and idempotent** — it never overwrites an existing
file, only creates missing ones (printing which were created vs. skipped), so
it's safe to re-run and won't clobber your hand-edited routes. You still
handle steps 1 and 2 (install, browser), then edit `responsive.routes.ts`
with your real routes and adapt the generated `webServer.command`/`baseURL`
to your stack.

## Quick start (Playwright already configured)

If your project already has a working Playwright setup with a `baseURL`, keep
your routes in a `responsive.routes.ts` at the project root and point a stub
spec at it:

```ts
// responsive.routes.ts (project root)
export const responsiveRoutes = ["/", "/about", "/pricing"];
```

```ts
// e2e/overflow.spec.ts (under your testDir)
import { defineOverflowTests } from "responsive-overflow-tests";
import { responsiveRoutes } from "../responsive.routes";

defineOverflowTests({ label: "responsive overflow", routes: responsiveRoutes });
```

Run it the same way you run any other Playwright spec (`npx playwright test`).
Adjust the `../` in the import to however many directories your spec sits
below the root routes file.

> **Shorthand:** `routes` also accepts an inline array
> (`defineOverflowTests({ routes: ["/", "/about"] })`) if you'd rather not
> keep a separate file. The root `responsive.routes.ts` is the recommended
> default because it keeps the per-site list in one obvious place, but inline
> is fully supported.

## Options

```ts
interface OverflowTestOptions {
  routes: string[];
  tier?: "light" | "medium" | "full";
  source?: "breakpoints" | "devices" | Viewport[];
  tolerancePx?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  expectStatus?: number | false;
  label?: string;
}
```

- **`routes`** (required) — paths relative to the Playwright `baseURL`.
  Recommended: keep this list in `responsive.routes.ts` at your project root
  and import it into the spec (see [Quick start](#quick-start-playwright-already-configured));
  an inline array works too.
- **`tier`** — how much viewport coverage to run. Tiers are **cumulative**:
  `medium` includes everything in `light`; `full` includes everything in
  `medium`. Defaults to the `RESPONSIVE_TIER` env var (lowercased), or
  `'light'` if that's unset. An unrecognized value falls back to `light`. A
  typical cadence:
  - `light` — every commit / PR. Fast, catches the common breakpoints.
  - `medium` — after a significant layout change, before merging.
  - `full` — pre-release / nightly. The widest net: on `breakpoints`,
    stress widths from 280px up to 2560px; on `devices`, foldables,
    tablets, and the tightest mobile sizes.

  ```bash
  RESPONSIVE_TIER=full npx playwright test
  ```

- **`source`** — where the viewport list comes from:
  - `'breakpoints'` (default) — synthetic sizes anchored to Tailwind v4's
    default breakpoints (sm/md/lg/xl/2xl) plus a couple of boundary widths.
  - `'devices'` — a curated matrix of real device viewports (current-gen
    phones, foldables, tablets, common desktop sizes).
  - A custom array — supply your own `{ name, width, height }[]` and skip
    the built-in sets entirely.

  ```ts
  defineOverflowTests({ routes: ["/"], source: "devices", tier: "medium" });

  defineOverflowTests({
    routes: ["/checkout"],
    source: [{ name: "kiosk-1080", width: 1080, height: 1920 }],
  });
  ```

- **`tolerancePx`** — allowed overflow in pixels before a test fails.
  Default `1` (absorbs sub-pixel rounding).
- **`waitUntil`** — passed straight through to `page.goto()`. Default
  `'networkidle'`.
- **`expectStatus`** — expected HTTP status for each route. Default `200`.
  Pass `false` to skip the status check (useful for routes that
  intentionally redirect or 404).
- **`label`** — optional label for the generated `test.describe()` block.
  Default `'responsive overflow'`.

## Other exports

```ts
import {
  overflowReport,
  BREAKPOINT_TIERS,
  DEVICE_TIERS,
  cumulative,
} from "responsive-overflow-tests";
```

- **`overflowReport(page)`** — the underlying detection primitive, if you
  want to run the check manually inside a custom test instead of using
  `defineOverflowTests`. Returns `{ scrollWidth, clientWidth, offenders }`.
- **`BREAKPOINT_TIERS`** / **`DEVICE_TIERS`** — the built-in viewport tier
  tables (`Record<"light" | "medium" | "full", Viewport[]>`), if you want to
  inspect or extend them.
- **`cumulative(tiers, tier)`** — resolves a tier name to its cumulative
  viewport list (used internally, exposed for custom tooling).

The `OverflowTestOptions`, `Viewport`, `Tier`, and `ViewportSource` types are
exported too.

## License

MIT © CyberPunk
