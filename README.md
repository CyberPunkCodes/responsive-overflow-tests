# responsive-overflow-tests

Catches horizontal-overflow layout breaks — the "page is wider than the
screen" bug — across Tailwind breakpoints and real-device viewports.

Framework and language agnostic. It drives a browser over HTTP, so it works
against Next, Astro, Vite, SvelteKit, Laravel, Rails, Django, WordPress, or a
folder of static HTML. It never touches your source.

No screenshots. No image diffing. No AI. Just DOM measurement, so it runs
unattended in CI and either passes or points at the element that broke.

```
✘  no horizontal overflow — /about @ md-768 (768px)

   Horizontal overflow at /about @ md-768 (768px):
   scrollWidth 812px > clientWidth 768px (44px over, tolerance 1px).
   Worst offending elements:
     div#hero.grid.grid-cols-3 — right edge: 812px, width: 812px
```

## Why not visual/screenshot testing?

Visual regression tools compare pixels, so someone — a human or a model — has
to judge whether a diff is a real break or just noise: font rendering,
animation timing, a new blog title. This does neither.

At each viewport it reads `document.documentElement.scrollWidth` against
`clientWidth` inside the page. Wider than the viewport means something
overflowed. Full stop, no judgment call. No baseline images to maintain, no
review step, no flaky pixel diffs.

When it fails it walks the DOM for the elements whose bounding boxes actually
cross the right edge and names the worst offenders, so you aren't bisecting
the page by hand.

## Requirements

- **Node 18+** — the tests run on Node even if your app doesn't.
- **A site you can serve locally over HTTP** (any stack).

## Getting started

### 1. Install

```bash
npm install --save-dev responsive-overflow-tests @playwright/test
```

`@playwright/test` is a peer dependency, so install it alongside.

### 2. Install a browser

Playwright ships the runner; the browser binary is a separate download.

```bash
npx playwright install chromium
```

### 3. Scaffold

```bash
npx responsive-overflow-tests init
```

That creates three files and adds one line to your `.gitignore`:

| File | You edit it? | What it is |
|---|---|---|
| `responsive-overflow-tests.config.ts` | **Yes — this one** | Your port, routes, everything |
| `playwright.config.ts` | No | Three-line shim that reads the config above |
| `e2e/overflow.spec.ts` | No | Generated test stub |
| `.gitignore` | — | Gains `.playwright/` |

Nothing else is written, and existing files are never overwritten. If you
already have a `playwright.config.*`, `init` leaves it alone and prints how to
merge — see [Using an existing Playwright config](ADVANCED.md#using-an-existing-playwright-config).

Not using TypeScript? `init` detects that and scaffolds `.js`/`.mjs` instead.

> **Gitignore.** Every artifact a run produces — traces, error context, the
> cached login session — goes to `.playwright/`, and nothing is written outside
> it. `init` adds that one line to your `.gitignore` for you. **Worth
> confirming it landed**, particularly if your ignore rules live somewhere
> non-standard (a global gitignore, `.git/info/exclude`, or a monorepo root):
>
> ```gitignore
> .playwright/
> ```

### 4. Configure

Open `responsive-overflow-tests.config.ts`. To get a first run, there are three
things to set — where your site runs, how to start it, and what to check:

```ts
import { defineConfig } from "responsive-overflow-tests";

export default defineConfig({
  // The port your dev server runs on.
  //   Next 3000 · Astro 4321 · Vite/SvelteKit 5173 · Laravel 8000
  port: 3000,

  // How to boot it. Delete this line if you start the server yourself.
  //   Laravel: "php artisan serve"
  //   PHP:     "php -S localhost:8000 -t public"
  //   Static:  "npx http-server ./dist -p 8080"
  startCommand: "npm run dev",

  // The routes to check.
  routes: {
    light: ["/", "/about", "/contact"],
    medium: [],
    full: [],
  },
});
```

You don't need every route on your site. Put the pages whose layout actually
matters in `light`, and let the other tiers grow over time.

That's the minimum. The same file also holds authentication, custom viewports,
ignored selectors, timeouts, and tier defaults — see the
[full config reference](ADVANCED.md#config-reference). You will not need a
second config file for any of it.

### 5. Run

```bash
npx playwright test
```

Playwright boots your server, checks every route at every viewport in the
active tier, and shuts down. One test per route × viewport.

### 6. Wire it into your test script

```json
{
  "scripts": {
    "test:responsive": "playwright test",
    "test": "vitest run && npm run test:responsive"
  }
}
```

### 7. Tell your AI agent about it

If you work with an AI coding agent, it won't discover any of this on its own.
Paste this to it once:

> Read `node_modules/responsive-overflow-tests/ADVANCED.md`, find the
> "AI agents & automated workflows" section, and add its guidance block to this
> project's `AGENTS.md` (or `CLAUDE.md` if that's what we use).

`ADVANCED.md` ships inside the package, so this needs no network access. The
agent ends up with the rules written into your project's own instructions:
which tier to run when, that a failure means fixing the element rather than
raising `tolerancePx`, and to add new routes to the config.

See [AI agents and automated workflows](ADVANCED.md#ai-agents--automated-workflows)
for the block itself and the reasoning behind the tiers.

## Coverage tiers

One knob: `tier`. It scales **both** the viewports and the routes, and the
tiers are cumulative — `medium` runs everything in `light` too.

| Tier | Viewports | When to run it |
|---|---|---|
| `light` (default) | 6 — every Tailwind v4 breakpoint plus a small-phone width | Every commit |
| `medium` | +9 — one px below each breakpoint, plus real phone/desktop widths | Significant layout changes, before merging |
| `full` | +3 — fold, QHD, ultrawide | CI, pre-release |

Override per run:

```bash
RESPONSIVE_TIER=full npx playwright test
```

### Why `medium` tests 767px and not just 768px

Tailwind breakpoints are `min-width`, so `md:` engages at 768. At exactly 768
you get the layout you designed and looked at. **767** is where the *smaller*
layout is still active and stretched to its widest — which is where things
actually burst, and the width nobody ever eyeballs. `medium` covers both sides
of every breakpoint for that reason.

## Going further

All of it lives in the same single config file — see
**[ADVANCED.md](ADVANCED.md)**:

- [Testing pages behind a login](ADVANCED.md#authentication)
- [Custom viewports and resolutions](ADVANCED.md#custom-viewports)
- [Ignoring embeds you can't fix](ADVANCED.md#ignoring-known-offenders)
- [Continuous integration](ADVANCED.md#continuous-integration)
- [AI agents and automated workflows](ADVANCED.md#ai-agents--automated-workflows)
- [Troubleshooting](ADVANCED.md#troubleshooting)
- [Full config reference](ADVANCED.md#config-reference)
- [Using an existing Playwright config](ADVANCED.md#using-an-existing-playwright-config)
- [Writing your own spec](ADVANCED.md#writing-your-own-spec)

Upgrading from an earlier version? See the [changelog](CHANGELOG.md) — 0.3.0
replaced the old API.

## What it does not do

- It does not check vertical overflow, visual styling, or content.
- It does not replace visual review — it proves the layout didn't *physically*
  break, not that it *looks* right.
- It does not need or produce baseline images.
- It does not check pages it isn't told about — routes are an explicit list,
  not a crawl.

## Pair it with a screenshot pass

This is the deterministic half. It will never tell you that two elements
overlap, that a heading wrapped badly, or that a section is unreadable at
390px — all of which fit inside the viewport and pass here.

For that, run a screenshot pass and actually look at the output. If you use
Claude Code, [`frontend-screenshot-verification`](https://github.com/CyberPunkCodes/claude-dev-plugins/tree/main/plugins/frontend-screenshot-verification)
is a plugin that renders a route across a tiered matrix of real device
viewports so an agent can review them. Any screenshot tool works — the point
is that something has to exercise judgment.

The two overlap slightly: that plugin also flags horizontal overflow, since
it's free once the page is loaded. Treat this package as the authoritative
one — it names the offending element, returns a non-zero exit code, and costs
nothing to run, so it's the one that belongs in `npm test` and CI. The
screenshot pass is for the questions no mechanical check can answer.

## License

MIT © CyberPunk
