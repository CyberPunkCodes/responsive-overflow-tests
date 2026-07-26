/**
 * Cumulative viewport-coverage tiers. Each tier includes everything from
 * the tiers before it: medium = light + medium, full = light + medium + full.
 */
export type Tier = "light" | "medium" | "full";

/** A single viewport to test against. */
export interface Viewport {
  /** Human-readable label used in the generated test title. */
  name: string;
  width: number;
  height: number;
}

/**
 * Where the viewport list comes from:
 * - `'breakpoints'` — Tailwind-breakpoint-anchored synthetic sizes (default).
 * - `'devices'` — a curated matrix of real device viewports.
 * - `Viewport[]` — a caller-supplied custom list, used as-is.
 */
export type ViewportSource = "breakpoints" | "devices" | Viewport[];

export interface OverflowTestOptions {
  /** Paths relative to the Playwright `baseURL`, e.g. `['/', '/about']`. */
  routes: string[];
  /**
   * Coverage tier. Defaults to `process.env.RESPONSIVE_TIER` (lowercased),
   * falling back to `'light'` if unset. Tiers are cumulative.
   */
  tier?: Tier;
  /** Viewport source. Defaults to `'breakpoints'`. */
  source?: ViewportSource;
  /** Allowed overflow in px before a test fails. Default `1`. */
  tolerancePx?: number;
  /** Passed through to `page.goto()`. Default `'networkidle'`. */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Expected HTTP status for each route. `false` skips the check. Default `200`. */
  expectStatus?: number | false;
  /** Optional label for the generated `test.describe()` block. */
  label?: string;
}
