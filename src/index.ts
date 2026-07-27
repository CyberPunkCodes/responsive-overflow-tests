import { expect, type Page } from "@playwright/test";
import { overflowReport, type Offender } from "./overflow.js";
import {
  resolveAuthedRoutes,
  resolveRoutes,
  resolveTier,
  resolveViewports,
} from "./config.js";
import type { OverflowCase, ResponsiveConfig, Viewport } from "./types.js";

export { overflowReport } from "./overflow.js";
export type { OverflowReport, Offender } from "./overflow.js";
export { BREAKPOINT_TIERS, DEVICE_TIERS, TIER_ORDER, cumulative } from "./viewports.js";
export {
  defineConfig,
  authStoragePath,
  resolveTier,
  resolveRoutes,
  resolveAuthedRoutes,
  resolveViewports,
  resolveBaseURL,
  resolveOutputDir,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TEST_DIR,
} from "./config.js";
export { toPlaywrightConfig } from "./playwright.js";
export { ensureAuthSession, createAuthedPage } from "./auth.js";
export type {
  ResponsiveConfig,
  OverflowCase,
  Viewport,
  Tier,
  ViewportSource,
  RouteInput,
  RouteGroups,
  ViewportGroups,
  AuthConfig,
  LoginConfig,
} from "./types.js";

function formatOffender(o: Offender): string {
  const classSuffix = o.cls ? `.${o.cls.split(/\s+/).filter(Boolean).join(".")}` : "";
  return `  ${o.tag}${o.id}${classSuffix} — right edge: ${o.right}px, width: ${o.width}px`;
}

function buildCases(routes: string[], viewports: Viewport[]): OverflowCase[] {
  const cases: OverflowCase[] = [];
  for (const route of routes) {
    for (const viewport of viewports) {
      cases.push({
        title: `no horizontal overflow — ${route} @ ${viewport.name} (${viewport.width}px)`,
        route,
        viewport,
      });
    }
  }
  return cases;
}

/**
 * Public route × viewport checks for the active tier, as plain data.
 *
 * The generated spec loops over these and calls `test()` itself, so Playwright
 * attributes failures to the consumer's own spec file rather than to a line
 * inside `node_modules`.
 */
export function overflowCases(config: ResponsiveConfig): OverflowCase[] {
  const tier = resolveTier(config);
  return buildCases(resolveRoutes(config, tier), resolveViewports(config, tier));
}

/** Login-gated route × viewport checks for the active tier. */
export function authedOverflowCases(config: ResponsiveConfig): OverflowCase[] {
  const tier = resolveTier(config);
  return buildCases(resolveAuthedRoutes(config, tier), resolveViewports(config, tier));
}

/**
 * Loads one route at one viewport and fails if the document overflows
 * horizontally. Reports the specific elements crossing the right edge.
 */
export async function runOverflowCheck(
  page: Page,
  testCase: OverflowCase,
  config: ResponsiveConfig
): Promise<void> {
  const { tolerancePx = 1, waitUntil = "load", expectStatus = 200, ignore = [] } = config;
  const { route, viewport } = testCase;

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const response = await page.goto(route, { waitUntil });

  if (expectStatus !== false) {
    expect(
      response?.status(),
      `expected ${route} to respond with status ${expectStatus}`
    ).toBe(expectStatus);
  }

  const report = await overflowReport(page, ignore);
  const overflowPx = report.scrollWidth - report.clientWidth;

  if (overflowPx <= tolerancePx) return;

  // Everything past the edge was explicitly ignored — treat as a pass.
  if (report.offenders.length === 0 && report.ignored > 0) return;

  const offenderLines =
    report.offenders.length > 0
      ? report.offenders.map(formatOffender).join("\n")
      : "  (no individual offenders captured — check for horizontal margins/padding on <body>/<html>)";

  const ignoredNote = report.ignored > 0 ? `\n(${report.ignored} more suppressed by \`ignore\`)` : "";

  throw new Error(
    `Horizontal overflow at ${route} @ ${viewport.name} (${viewport.width}px): ` +
      `scrollWidth ${report.scrollWidth}px > clientWidth ${report.clientWidth}px ` +
      `(${overflowPx}px over, tolerance ${tolerancePx}px).\n` +
      `Worst offending elements:\n${offenderLines}${ignoredNote}`
  );
}
