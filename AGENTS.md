# AGENTS.md

Orientation for AI coding agents (and new contributors) working **on** this
package. If you are working on a project that *uses* this package, you want
[ADVANCED.md § AI agents](ADVANCED.md#ai-agents--automated-workflows) instead.

## What this is

`responsive-overflow-tests` — a Playwright-based check that fails when a page
overflows horizontally. Deterministic DOM measurement, no screenshots, no
image diffing, no AI in the loop.

It is framework and language agnostic on purpose. It drives a browser over
HTTP, so it works against any stack that serves HTML — Next, Astro, Vite,
SvelteKit, Laravel, Rails, Django, WordPress, static files. **Never introduce
a dependency on, or an assumption about, a specific framework.**

## Design rules — do not break these

1. **One config file.** Consumers edit `responsive-overflow-tests.config.*` at
   their project root and nothing else. Anything new must be configurable
   there, not in a second file and not by editing the generated spec.
2. **No surprise files.** `init` creates exactly what it announces on stdout,
   never overwrites, and is safe to re-run. All runtime artifacts go under one
   directory (`.playwright/` by default) so consumers have one gitignore line.
   A passing run leaves only Playwright's own bookkeeping file behind.
3. **No framework defaults.** No stack is the "default" one. Where an example
   is needed, list several with equal weight.
4. **No runtime dependencies.** `@playwright/test` is a peer dependency; the
   CLI uses Node built-ins only. Keep it that way.
5. **Deterministic.** No screenshots, no baselines, no heuristics that need a
   human to adjudicate. If a check can't be decided mechanically, it doesn't
   belong here.
6. **Tiers are cumulative on both axes** — viewports *and* route groups.
   `medium` always includes everything in `light`.
7. **No `import.meta`, anywhere.** Playwright transpiles imported modules to
   CommonJS when the consuming project is not ESM, and `import.meta` is a
   parse-time syntax error there. A unit test enforces this.
8. **One way to register tests.** The consumer's spec owns the `test()` loop
   (via `overflowCases()`), so failures attribute to their file rather than to
   `node_modules`. Do not reintroduce a helper that calls `test()` internally.

## Layout

```
src/
  index.ts          Public API: overflowCases, authedOverflowCases,
                    runOverflowCheck, re-exports
  config.ts         defineConfig + all resolution (tier, routes, viewports, URLs)
  playwright.ts     toPlaywrightConfig — config → Playwright config
  viewports.ts      BREAKPOINT_TIERS, DEVICE_TIERS, cumulative()
  overflow.ts       The DOM measurement primitive
  auth.ts           Login + authed context for authedRoutes (no scaffolded files)
  cli.ts            `responsive-overflow-tests init`
  types.ts          ResponsiveConfig and friends
tests/              Vitest unit tests
README.md           Basic path: install → configure → run
ADVANCED.md         Auth, custom viewports, ignore, CI, agents, troubleshooting,
                    config reference, existing-config merge
CHANGELOG.md        Every user-visible change; migration notes for breaks
```

Docs rule: the README covers only the happy path to a first green run.
Anything beyond that belongs in ADVANCED.md, linked from the README's
"Going further" list. Don't let ADVANCED-level detail creep into the README.

`dist/` is built output and is gitignored; `files: ["dist"]` in package.json
controls what actually ships.

## Working on it

```bash
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

All three must pass before anything is committed.

When changing `init`, verify it by hand in a throwaway directory — never in a
real project:

```bash
mkdir -p /tmp/scratch && cd /tmp/scratch && npm init -y
node /path/to/repo/dist/cli.js init
```

Check: all files created, a second run skips them all, hand-edits survive,
`.gitignore` isn't duplicated.

## Viewport tiers

`light` is exactly the Tailwind v4 breakpoints (640/768/1024/1280/1536) plus a
small-phone width. `medium` adds the one-px-below boundary widths (639/767/
1023/1279/1535) — the highest-yield widths for overflow, because Tailwind
breakpoints are `min-width` and the smaller layout is at maximum stress there
— plus real phone/desktop widths. `full` adds the extremes.

If you change a tier table, update the README table, the ADVANCED reference,
and `tests/config.test.ts` in the same change.

## Publishing

- **Every user-visible change gets a `CHANGELOG.md` entry** under the target
  version, in the existing Added/Changed/Removed/Fixed shape. Breaking changes
  are called out explicitly with a migration snippet — this package is pre-1.0,
  so breaking changes can land in a minor and the changelog is the only warning
  a consumer gets.
- Versions are published manually by the maintainer; a hardware passkey is
  required. **Do not run `npm publish`.**
- npm permanently retires published version numbers — never reuse one.
- Update the version only when asked, and say which bump you applied.

## Anonymity

This package is published under the alias **CyberPunk**. Author strings are
`CyberPunk` / `MIT © CyberPunk`. Do not add real names, other identities,
business names, or links to unrelated accounts anywhere — source, docs,
examples, commit messages, or metadata.
