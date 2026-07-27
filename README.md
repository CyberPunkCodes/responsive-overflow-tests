# responsive-overflow-tests

Automated tests that catch **horizontal overflow** — a page that ends up wider
than the screen showing it, so the whole thing scrolls sideways.

You give it a list of routes. It loads each one in a real browser at every
screen width that matters, measures whether anything crosses the right edge of
the viewport, and fails with the element responsible.

```
✘  no horizontal overflow — /about @ md-768 (768px)

   Horizontal overflow at /about @ md-768 (768px):
   scrollWidth 812px > clientWidth 768px (44px over, tolerance 1px).
   Worst offending elements:
     div#hero.grid.grid-cols-3 — right edge: 812px, width: 812px
```

Setup is one config file. Runs in seconds, in `npm test` or CI.

## Why

Horizontal overflow is the most common responsive bug there is, and one of the
hardest to notice. A single element too wide — an image without a `max-width`, a
table, a long unbroken URL, a grid that doesn't wrap, a `100vw` block inside
padding — drags the entire page with it. Nothing errors. It renders fine on a
desktop monitor, so it survives development and code review, and usually
surfaces after release.

It also isn't only cosmetic:

- **Mobile is the version Google indexes.** Under mobile-first indexing, the
  mobile rendering is what gets crawled and evaluated.
- **It's an accessibility failure.** WCAG 2.1 criterion 1.4.10 (Reflow, level
  AA) requires content to reflow to a 320px width without horizontal scrolling.
- **It costs conversions.** A submit button sitting off the right edge is not a
  styling nit.

Checking it by hand means opening every page at a dozen widths after every
change, which nobody sustains. This makes it a test: no screenshots, no
baselines, no diffs to approve — it passes, or it names the element to fix.

### For AI coding agents

An agent editing layout code can't see the result. It has no way to know a
change pushed something past the viewport, so it reports the work as done and
the break ships.

The less obvious problem is what it does when you ask it to check. It writes a
Playwright script — picking its own viewports, its own tolerance, its own guess
at which pages matter — runs it, and throws it away. Next session it writes a
different one. Across a handful of projects you end up with a handful of
incompatible ad-hoc harnesses and no baseline anywhere: nothing is a regression,
because nothing was measured the same way twice. A page checked at 375px last
week is checked at 390px today, and the width that actually broke gets tested by
nobody.

The agent is going to build this anyway. This is the version it would have
written, settled in advance — the same viewport coverage in every project from
the first commit, in a config a human can read and change.

Cost is the other half, and it's why the tiers exist. `light` is six viewports
and reports a line or two of text, so an agent can run it after small edits
without it being a decision — no screenshots to feed back through a model, no
context burned re-deriving the harness. `medium` widens the net for a real
layout change, `full` belongs in CI. One tool, scaled by the size of the edit
rather than swapped out for a bigger one.

[Step 7](#7-tell-your-ai-agent-about-it) wires this into your agent's own
instructions in one paste.

## Framework and language agnostic

It drives a browser over HTTP, so it works against Next, Astro, Vite,
SvelteKit, Nuxt, Remix, Laravel, Rails, Django, WordPress, or a folder of static
HTML. It never reads or touches your source — only the rendered page.

Tailwind users get a head start: the default viewports are Tailwind v4's
breakpoints. If you don't use Tailwind, replace them with your own in one config
key.

## Why not visual/screenshot testing?

Visual regression tools compare pixels, so someone — a human or a model — has to
judge whether a diff is a real break or just noise: font rendering, animation
timing, a new blog title. This does neither.

At each viewport it reads `document.documentElement.scrollWidth` against
`clientWidth` inside the page. Wider than the viewport means something
overflowed. Full stop, no judgment call. No baseline images to maintain, no
review step, no flaky pixel diffs.

When it fails it walks the DOM for the elements whose bounding boxes actually
cross the right edge and names the worst offenders, so you aren't bisecting the
page by hand.

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

Nothing else is written, and existing files are never overwritten.

Not using TypeScript? `init` detects that and scaffolds `.js`/`.mjs` instead.

> **Already have a Playwright suite?** `init` sees your `playwright.config.*`,
> leaves it alone, and prints how to connect the two. Your config keeps owning
> `baseURL`, `webServer`, projects and workers; this one contributes routes and
> viewports only. Delete the generated shim and follow
> [Using an existing Playwright config](ADVANCED.md#using-an-existing-playwright-config)
> — there's one Playwright gotcha there worth reading before you run it.

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
  // The port to serve the site on for tests.
  //   Framework defaults: Next 3000 · Astro 4321 · Vite/SvelteKit 5173 · Laravel 8000
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

> **Give the tests their own port.** The obvious choice is your framework's
> default, and it's the one that bites. Locally the runner attaches to an
> already-running server rather than booting one (`reuseExistingServer`), so if
> your own `npm run dev` is sitting on that port, the tests silently check
> *that* — possibly a different branch, possibly a stale build — and you get a
> green run against the wrong site. Pick a port you only use for tests, set it
> here and in `startCommand`, and the two can never collide.

That's the minimum. The same file also holds authentication, custom viewports,
ignored selectors, timeouts, and tier defaults — see the
[full config reference](ADVANCED.md#config-reference). You will not need a
second config file for any of it.

### 5. Run

```bash
npx playwright test
```

Playwright boots your server, checks every route at every viewport in the active
tier, and shuts down. One test per route × viewport.

> **Testing a page that charges a card, sends mail, or writes to a database?**
> These are real page loads in a real browser, and a checkout route will do
> checkout things. Read
> [Routes that do something](ADVANCED.md#routes-that-do-something) before you
> add one — especially if this will ever run in CI.

### 6. Wire it into your test script

```json
{
  "scripts": {
    "test:responsive": "playwright test",
    "test": "vitest run && npm run test:responsive"
  }
}
```

If you have other Playwright suites, narrow this one with
`playwright test -g "horizontal overflow"` — every generated test title contains
that phrase — or with `--project=` if you gave it its own project.

### 7. Tell your AI agent about it

If you work with an AI coding agent, it won't discover any of this on its own.
Paste this to it once:

> Read `node_modules/responsive-overflow-tests/ADVANCED.md`, find the
> "AI agents & automated workflows" section, and add its guidance block to this
> project's `AGENTS.md` (or `CLAUDE.md` if that's what we use).

`ADVANCED.md` ships inside the package, so this needs no network access. The
agent ends up with the rules written into your project's own instructions: which
tier to run when, that a failure means fixing the element rather than raising
`tolerancePx`, and to add new routes to the config.

See [AI agents and automated workflows](ADVANCED.md#ai-agents--automated-workflows)
for the block itself and the reasoning behind the tiers.

## Coverage tiers

One knob: `tier`. It scales **both** the viewports and the routes, and the tiers
are cumulative — `medium` runs everything in `light` too.

| Tier | Viewports | When to run it |
|---|---|---|
| `light` (default) | 6 — every Tailwind v4 breakpoint plus a small-phone width | Every commit |
| `medium` | +9 — one px below each breakpoint, plus real phone/desktop widths including 320px | Significant layout changes, before merging |
| `full` | +3 — fold, QHD, ultrawide | CI, pre-release |

Override per run:

```bash
RESPONSIVE_TIER=full npx playwright test
```

If WCAG reflow compliance is what you're after, `medium` is your floor — 320px,
the width criterion 1.4.10 is written against, lives in that tier.

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
- [Routes that do something — payments, mail, side effects](ADVANCED.md#routes-that-do-something)
- [Custom viewports and resolutions](ADVANCED.md#custom-viewports)
- [Ignoring embeds you can't fix](ADVANCED.md#ignoring-known-offenders)
- [Continuous integration and git hooks](ADVANCED.md#continuous-integration)
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
- It does not check pages it isn't told about — routes are an explicit list, not
  a crawl.

## Pair it with a screenshot pass

This is the deterministic half. It will never tell you that two elements
overlap, that a heading wrapped badly, or that a section is unreadable at 390px
— all of which fit inside the viewport and pass here.

For that, run a screenshot pass and actually look at the output. If you use
Claude Code, [`frontend-screenshot-verification`](https://github.com/CyberPunkCodes/claude-dev-plugins/tree/main/plugins/frontend-screenshot-verification)
is a plugin that renders a route across a tiered matrix of real device viewports
so an agent can review them. Any screenshot tool works — the point is that
something has to exercise judgment.

The two overlap slightly: that plugin also flags horizontal overflow, since it's
free once the page is loaded. Treat this package as the authoritative one — it
names the offending element, returns a non-zero exit code, and costs nothing to
run, so it's the one that belongs in `npm test` and CI. The screenshot pass is
for the questions no mechanical check can answer.

## License

MIT © CyberPunk
