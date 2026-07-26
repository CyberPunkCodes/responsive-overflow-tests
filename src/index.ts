import { test, expect } from "@playwright/test";
import { overflowReport } from "./overflow.js";
import { BREAKPOINT_TIERS, DEVICE_TIERS, cumulative } from "./viewports.js";
import type { OverflowTestOptions, Viewport } from "./types.js";

export { overflowReport } from "./overflow.js";
export { BREAKPOINT_TIERS, DEVICE_TIERS, cumulative } from "./viewports.js";
export type { OverflowTestOptions, Viewport, Tier, ViewportSource } from "./types.js";

function resolveTier(options: OverflowTestOptions): string {
  return (options.tier ?? process.env.RESPONSIVE_TIER ?? "light").toLowerCase();
}

function resolveViewports(options: OverflowTestOptions): Viewport[] {
  if (Array.isArray(options.source)) return options.source;

  const tiers = options.source === "devices" ? DEVICE_TIERS : BREAKPOINT_TIERS;
  return cumulative(tiers, resolveTier(options));
}

function formatOffender(o: { tag: string; id: string; cls: string; right: number; width: number }): string {
  const classSuffix = o.cls ? `.${o.cls.split(/\s+/).filter(Boolean).join(".")}` : "";
  return `  ${o.tag}${o.id}${classSuffix} — right edge: ${o.right}px, width: ${o.width}px`;
}

/**
 * Registers a `test.describe()` block (call from within a Playwright spec
 * file) with one test per route × viewport combination. Each test loads the
 * route at that viewport and fails if the document overflows horizontally.
 */
export function defineOverflowTests(options: OverflowTestOptions): void {
  const { routes, tolerancePx = 1, waitUntil = "networkidle", expectStatus = 200, label } = options;

  const viewports = resolveViewports(options);

  test.describe(label ?? "responsive overflow", () => {
    for (const route of routes) {
      for (const viewport of viewports) {
        test(`no horizontal overflow — ${route} @ ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const response = await page.goto(route, { waitUntil });

          if (expectStatus !== false) {
            expect(
              response?.status(),
              `expected ${route} to respond with status ${expectStatus}`
            ).toBe(expectStatus);
          }

          const report = await overflowReport(page);
          const overflowPx = report.scrollWidth - report.clientWidth;

          if (overflowPx > tolerancePx) {
            const offenderLines =
              report.offenders.length > 0
                ? report.offenders.map(formatOffender).join("\n")
                : "  (no individual offenders captured — check for horizontal margins/padding on <body>/<html>)";

            throw new Error(
              `Horizontal overflow at ${route} @ ${viewport.name} (${viewport.width}px): ` +
                `scrollWidth ${report.scrollWidth}px > clientWidth ${report.clientWidth}px ` +
                `(${overflowPx}px over, tolerance ${tolerancePx}px).\n` +
                `Worst offending elements:\n${offenderLines}`
            );
          }

          expect(overflowPx).toBeLessThanOrEqual(tolerancePx);
        });
      }
    }
  });
}
