import { BREAKPOINT_TIERS, DEVICE_TIERS, TIER_ORDER, cumulative } from "./viewports.js";
import type { ResponsiveConfig, RouteInput, Tier, Viewport } from "./types.js";

/** Everything this package writes goes under one directory. */
export const DEFAULT_OUTPUT_DIR = ".playwright";
export const DEFAULT_TEST_DIR = "e2e";

const isTier = (value: string): value is Tier => (TIER_ORDER as string[]).includes(value);

/**
 * Identity function with validation and editor autocomplete — the entry point
 * used in `responsive-overflow-tests.config.ts`. Throws early with a readable
 * message rather than letting a bad config surface as a confusing Playwright
 * error twenty seconds into a run.
 */
export function defineConfig(config: ResponsiveConfig): ResponsiveConfig {
  const problems: string[] = [];

  if (!config.routes) {
    problems.push("`routes` is required.");
  } else if (Array.isArray(config.routes)) {
    if (config.routes.length === 0) problems.push("`routes` is empty — nothing would be checked.");
  } else if (Object.keys(config.routes).length === 0) {
    problems.push("`routes` has no tier groups — nothing would be checked.");
  }

  if (config.tier && !isTier(config.tier)) {
    problems.push(`\`tier\` must be one of ${TIER_ORDER.join(", ")} — got "${config.tier}".`);
  }

  if (config.authedRoutes && !config.auth) {
    problems.push("`authedRoutes` is set but `auth` is missing — there is no way to log in.");
  }

  if (config.auth?.login && !config.auth.login.url) {
    problems.push("`auth.login.url` is required when using form login.");
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid responsive-overflow-tests config:\n${problems.map((p) => `  • ${p}`).join("\n")}`
    );
  }

  return config;
}

/** `RESPONSIVE_TIER` wins over the config value, which wins over `light`. */
export function resolveTier(config: ResponsiveConfig): Tier {
  const raw = (process.env.RESPONSIVE_TIER ?? config.tier ?? "light").toLowerCase();
  return isTier(raw) ? raw : "light";
}

/**
 * Undefined when neither `baseURL` nor `port` is set — valid when the consumer
 * merges into an existing Playwright config that already supplies `use.baseURL`.
 */
export function resolveBaseURL(config: ResponsiveConfig): string | undefined {
  if (config.baseURL) return config.baseURL.replace(/\/$/, "");
  if (config.port) return `http://${config.host ?? "localhost"}:${config.port}`;
  return undefined;
}

export function resolveOutputDir(config: ResponsiveConfig): string {
  return (config.outputDir ?? DEFAULT_OUTPUT_DIR).replace(/\/$/, "");
}

/** Where the logged-in session is cached. */
export function authStoragePath(config: ResponsiveConfig): string {
  return config.auth?.storageState ?? `${resolveOutputDir(config)}/auth/state.json`;
}

function routesFor(input: RouteInput | undefined, tier: Tier): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;

  const upTo = TIER_ORDER.indexOf(tier);
  const result: string[] = [];
  for (let i = 0; i <= upTo; i++) {
    result.push(...(input[TIER_ORDER[i]] ?? []));
  }
  return result;
}

/** Public routes for the active tier (cumulative when tier-grouped). */
export function resolveRoutes(config: ResponsiveConfig, tier = resolveTier(config)): string[] {
  return dedupe(routesFor(config.routes, tier));
}

/** Login-gated routes for the active tier. */
export function resolveAuthedRoutes(config: ResponsiveConfig, tier = resolveTier(config)): string[] {
  return dedupe(routesFor(config.authedRoutes, tier));
}

const dedupe = (values: string[]): string[] => Array.from(new Set(values));

/**
 * Built-in tiers (or a full replacement via `viewports`), plus anything in
 * `extraViewports`, resolved cumulatively and de-duplicated by dimensions so
 * a custom size that collides with a built-in doesn't run twice.
 */
export function resolveViewports(config: ResponsiveConfig, tier = resolveTier(config)): Viewport[] {
  const base = config.viewports ?? (config.source === "devices" ? DEVICE_TIERS : BREAKPOINT_TIERS);
  const combined = [...cumulative(base, tier), ...cumulative(config.extraViewports ?? {}, tier)];

  const seen = new Set<string>();
  return combined.filter((v) => {
    const key = `${v.width}x${v.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
