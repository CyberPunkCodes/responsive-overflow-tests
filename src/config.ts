import { BREAKPOINT_TIERS, DEVICE_TIERS, TIER_ORDER, cumulative } from "./viewports.js";
import { DEFAULT_CLIPPING_SELECTOR } from "./overflow.js";
import type { ResponsiveConfig, RouteInput, Tier, Viewport } from "./types.js";

/** Everything this package writes goes under one directory. */
export const DEFAULT_OUTPUT_DIR = ".playwright";
export const DEFAULT_TEST_DIR = "e2e";

/**
 * Environment variables that tell a process an AI agent launched it.
 *
 * Several dev servers change behaviour when they detect one — Astro 7.1+ forks
 * itself into a background daemon, so the wrapper exits immediately and
 * Playwright reports `Process from config.webServer exited early` even though
 * the server came up fine. Stripping these from the server's environment makes
 * a run behave identically whether a human or an agent started it, which is the
 * only way the check means the same thing in both cases.
 *
 * Framework-agnostic on purpose: this removes the *signal*, so it fixes any
 * tool that keys off it, not one specific framework.
 */
export const AGENT_ENV_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE",
  "CURSOR_AGENT",
  "CURSOR_TRACE_ID",
  "AIDER_CHAT",
  "REPL_ID",
  "CODEX_SANDBOX",
  "GEMINI_CLI",
  "OPENCODE",
  "AMP_CLI",
  "WINDSURF_AGENT",
] as const;

const isTier = (value: string): value is Tier => (TIER_ORDER as string[]).includes(value);

/** Resolved clipping-detection settings. */
export interface ResolvedClipping {
  enabled: boolean;
  selector: string;
  ignore: string[];
}

/**
 * Clipping detection settings, merged with the top-level `ignore` list so a
 * selector a consumer already excused from the primary check is not re-reported
 * by this one.
 */
export function resolveClipping(config: ResponsiveConfig): ResolvedClipping {
  const raw = config.clipping ?? true;
  const base = { selector: DEFAULT_CLIPPING_SELECTOR, ignore: config.ignore ?? [] };

  if (raw === false) return { ...base, enabled: false };
  if (raw === true) return { ...base, enabled: true };

  return {
    enabled: raw.enabled ?? true,
    selector: raw.selector ?? DEFAULT_CLIPPING_SELECTOR,
    ignore: [...(config.ignore ?? []), ...(raw.ignore ?? [])],
  };
}

/**
 * Environment *overrides* for the `startCommand` process — agent-detection
 * variables neutralised, then the consumer's `webServerEnv` on top.
 *
 * Returns overrides only, not a full environment: Playwright **merges**
 * `webServer.env` over `process.env`, so a variable cannot be deleted here,
 * only overwritten. Empty string is the portable stand-in — detection libraries
 * treat an empty value as absent (verified against `am-i-vibing`, which returns
 * `null` for `CLAUDECODE=`), and unlike `env -u` it works on Windows.
 *
 * Only variables that are actually set get an override, so a run in a plain
 * shell passes nothing extra to the server.
 */
export function resolveWebServerEnv(config: ResponsiveConfig): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of AGENT_ENV_VARS) {
    if (process.env[key] !== undefined) env[key] = "";
  }
  // `undefined` means "unset it" — emulated as empty string, per above.
  for (const [key, value] of Object.entries(config.webServerEnv ?? {})) {
    env[key] = value ?? "";
  }
  return env;
}

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
