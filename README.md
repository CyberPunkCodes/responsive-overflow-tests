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

## Install

Not yet published to npm. For now, consume it via a local path or a git URL:

```bash
npm install --save-dev github:CyberPunkCodes/responsive-overflow-tests
# or, from a local checkout:
npm install --save-dev /path/to/responsive-overflow-tests
```

`@playwright/test` is a peer dependency — install it in the consuming
project if it isn't already there.

## Quick start

In any Playwright spec file, in a project that already has a `baseURL`
configured:

```ts
import { defineOverflowTests } from "responsive-overflow-tests";

defineOverflowTests({ routes: ["/", "/about", "/pricing"], tier: "light" });
```

That registers one Playwright test per route × viewport combination, each
titled like:

```
no horizontal overflow — /pricing @ md-768 (768px)
```

Run it the same way you run any other Playwright spec (`npx playwright test`).

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
- **`tier`** — how much viewport coverage to run. Tiers are **cumulative**:
  `medium` includes everything in `light`; `full` includes everything in
  `medium`. Defaults to the `RESPONSIVE_TIER` env var (lowercased), or
  `'light'` if that's unset. A typical cadence:
  - `light` — every commit / PR. Fast, catches the common breakpoints.
  - `medium` — after a significant layout change, before merging.
  - `full` — pre-release / nightly. Widest net, including foldables,
    tablets, and stress-test widths.

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
  `defineOverflowTests`.
- **`BREAKPOINT_TIERS`** / **`DEVICE_TIERS`** — the built-in viewport tier
  tables, if you want to inspect or extend them.
- **`cumulative(tiers, tier)`** — resolves a tier name to its cumulative
  viewport list (used internally, exposed for custom tooling).

## License

MIT © CyberPunk
