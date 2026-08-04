import { expect, type Page } from "@playwright/test";
import { clippedReport, overflowReport, type ClippedOffender, type Offender } from "./overflow.js";
import {
  resolveAuthedRoutes,
  resolveClipping,
  resolveRoutes,
  resolveTier,
  resolveViewports,
} from "./config.js";
import type { OverflowCase, ResponsiveConfig, Viewport } from "./types.js";

export { overflowReport, clippedReport, DEFAULT_CLIPPING_SELECTOR } from "./overflow.js";
export type {
  OverflowReport,
  Offender,
  ClippedReport,
  ClippedOffender,
} from "./overflow.js";
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
  resolveClipping,
  resolveWebServerEnv,
  AGENT_ENV_VARS,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TEST_DIR,
} from "./config.js";
export type { ResolvedClipping } from "./config.js";
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
  ClippingConfig,
  AuthConfig,
  LoginConfig,
} from "./types.js";

function formatOffender(o: Offender): string {
  const classSuffix = o.cls ? `.${o.cls.split(/\s+/).filter(Boolean).join(".")}` : "";
  return `  ${o.tag}${o.id}${classSuffix} — right edge: ${o.right}px, width: ${o.width}px`;
}

function formatClipped(o: ClippedOffender): string {
  const classSuffix = o.cls ? `.${o.cls.split(/\s+/).filter(Boolean).join(".")}` : "";
  const where = o.side === "both" ? "past both edges" : `past the ${o.side} edge`;
  return `  ${o.tag}${o.id}${classSuffix} — ${o.overflowPx}px ${where} of ${o.clipper}`;
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

  // Everything past the edge was explicitly ignored — treat as a pass.
  const scrollOverflows =
    overflowPx > tolerancePx && !(report.offenders.length === 0 && report.ignored > 0);

  if (scrollOverflows) {
    const offenderLines =
      report.offenders.length > 0
        ? report.offenders.map(formatOffender).join("\n")
        : "  (no individual offenders captured — check for horizontal margins/padding on <body>/<html>)";

    const ignoredNote =
      report.ignored > 0 ? `\n(${report.ignored} more suppressed by \`ignore\`)` : "";

    throw new Error(
      `Horizontal overflow at ${route} @ ${viewport.name} (${viewport.width}px): ` +
        `scrollWidth ${report.scrollWidth}px > clientWidth ${report.clientWidth}px ` +
        `(${overflowPx}px over, tolerance ${tolerancePx}px).\n` +
        `Worst offending elements:\n${offenderLines}${ignoredNote}`
    );
  }

  // Clipped overflow produces no scrollbar, so the check above cannot see it.
  const clipping = resolveClipping(config);
  if (!clipping.enabled) return;

  const clipReport = await clippedReport(page, {
    selector: clipping.selector,
    ignore: clipping.ignore,
    tolerancePx,
  });
  if (clipReport.clipped.length === 0) return;

  const clippedIgnoredNote =
    clipReport.ignored > 0 ? `\n(${clipReport.ignored} more suppressed by \`ignore\`)` : "";

  throw new Error(
    `Clipped content at ${route} @ ${viewport.name} (${viewport.width}px): ` +
      `an ancestor with \`overflow-x: hidden\` is cutting these off, so the page ` +
      `does not scroll and the plain overflow check cannot see it.\n` +
      `${clipReport.clipped.map(formatClipped).join("\n")}${clippedIgnoredNote}\n` +
      `If this is deliberate (decorative full-bleed art, a marquee), add it to ` +
      `\`ignore\` or narrow \`clipping.selector\`.`
  );
}
