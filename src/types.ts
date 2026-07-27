/**
 * Cumulative coverage tiers. Each tier includes everything from the tiers
 * before it: medium = light + medium, full = light + medium + full. This
 * applies to BOTH axes — viewports and route groups.
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
 * Which built-in viewport set to use:
 * - `'breakpoints'` — Tailwind-breakpoint-anchored synthetic widths (default).
 * - `'devices'` — a curated matrix of real device viewports.
 *
 * To supply your own sizes, use `viewports` (replace) or `extraViewports`
 * (add) — both tier-keyed, so custom sizes scale with the tier like everything
 * else.
 */
export type ViewportSource = "breakpoints" | "devices";

/**
 * Routes keyed by the tier at which they START being checked. Cumulative:
 * a `medium` run checks the light group plus the medium group.
 */
export type RouteGroups = Partial<Record<Tier, string[]>>;

/**
 * Either a flat list (every route checked at every tier) or tier-keyed
 * groups (routes scale with the tier).
 */
export type RouteInput = string[] | RouteGroups;

/** Viewports keyed by tier, same cumulative semantics as `RouteGroups`. */
export type ViewportGroups = Partial<Record<Tier, Viewport[]>>;

/**
 * Form-login details. Credentials should come from environment variables —
 * never commit real ones into the config file.
 */
export interface LoginConfig {
  /** Login page path (relative to baseURL) or absolute URL. */
  url: string;
  username?: string;
  password?: string;
  /** Defaults to `input[type="email"], input[name="email"], input[name="username"]`. */
  usernameSelector?: string;
  /** Defaults to `input[type="password"]`. */
  passwordSelector?: string;
  /** Defaults to `button[type="submit"]`. */
  submitSelector?: string;
  /** Path/URL expected after a successful login. Used to confirm it worked. */
  successUrl?: string;
}

export interface AuthConfig {
  /** Log in with a real browser once, before the run, and reuse the session. */
  login?: LoginConfig;
  /** Reuse an existing Playwright storage-state JSON file instead of logging in. */
  storageState?: string;
  /** HTTP Basic auth (e.g. a staging site behind a gate). */
  httpCredentials?: { username: string; password: string };
  /** Extra request headers, e.g. a bearer token for a token-auth app. */
  headers?: Record<string, string>;
}

/**
 * The single configuration object. Lives in
 * `responsive-overflow-tests.config.ts` (or `.js`) at the project root and is
 * the only file a consumer edits.
 */
export interface ResponsiveConfig {
  // ── Where the site is served ──────────────────────────────────────────
  /** Port your local server listens on. Ignored if `baseURL` is set. */
  port?: number;
  /** Host for the local server. Defaults to `localhost`. */
  host?: string;
  /** Full base URL. Use instead of `port`/`host` to test a deployed site. */
  baseURL?: string;
  /** Command that boots the site. Omit if the server is already running. */
  startCommand?: string;
  /** Attach to an already-running server instead of booting one. Default: true outside CI. */
  reuseExistingServer?: boolean;

  // ── What to check ─────────────────────────────────────────────────────
  /** Public routes: a flat list, or tier-keyed groups. */
  routes: RouteInput;
  /** Routes that require a logged-in session. Requires `auth`. */
  authedRoutes?: RouteInput;
  /** How to obtain a session for `authedRoutes`. */
  auth?: AuthConfig;

  // ── Viewports ─────────────────────────────────────────────────────────
  /** Built-in viewport set to use. Default `'breakpoints'`. */
  source?: ViewportSource;
  /** REPLACE the built-in tiers entirely. */
  viewports?: ViewportGroups;
  /** ADD to the built-in tiers. */
  extraViewports?: ViewportGroups;

  // ── Run behaviour ─────────────────────────────────────────────────────
  /** Coverage tier. `RESPONSIVE_TIER` env var wins over this. Default `'light'`. */
  tier?: Tier;
  /** Allowed overflow in px before a check fails. Default `1`. */
  tolerancePx?: number;
  /** Passed through to `page.goto()`. Default `'load'`. */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Expected HTTP status for each route. `false` skips the check. Default `200`. */
  expectStatus?: number | false;
  /**
   * CSS selectors for elements you can't fix (third-party embeds, ad slots).
   * An element matching one of these — or nested inside one — is excluded
   * from the offender list. See ADVANCED.md for the caveat.
   */
  ignore?: string[];
  /** Per-check timeout in ms. Default `30000`. */
  timeout?: number;
  /** Directory for all Playwright artifacts. Default `'.playwright'`. */
  outputDir?: string;
  /** Directory Playwright discovers specs in. Default `'e2e'`. */
  testDir?: string;
}

/** One resolved route × viewport check. */
export interface OverflowCase {
  /** Playwright test title. */
  title: string;
  route: string;
  viewport: Viewport;
}
