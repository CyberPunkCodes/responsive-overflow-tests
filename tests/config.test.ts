import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  defineConfig,
  authStoragePath,
  resolveBaseURL,
  resolveRoutes,
  resolveAuthedRoutes,
  resolveTier,
  resolveViewports,
} from "../src/config.js";
import { toPlaywrightConfig } from "../src/playwright.js";
import { BREAKPOINT_TIERS } from "../src/viewports.js";

const base = { port: 3000, routes: ["/"] };

afterEach(() => {
  delete process.env.RESPONSIVE_TIER;
});

describe("module-system compatibility", () => {
  // Playwright transpiles imported modules to CommonJS when the consuming
  // project is not ESM. `import.meta` is a parse-time syntax error under CJS,
  // so a single stray use breaks the package for most projects. This shipped
  // once; it must not ship again.
  it("no source file uses import.meta", () => {
    const dir = join(import.meta.dirname, "..", "src");
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => stripComments(readFileSync(join(dir, f), "utf8")).includes("import.meta"));

    expect(offenders).toEqual([]);
  });
});

describe("defineConfig validation", () => {
  it("returns the config unchanged when valid", () => {
    expect(defineConfig(base)).toEqual(base);
  });

  it("rejects a config with no routes", () => {
    expect(() => defineConfig({ port: 3000, routes: [] })).toThrow(/routes/);
  });

  it("rejects empty tier groups", () => {
    expect(() => defineConfig({ port: 3000, routes: {} })).toThrow(/tier groups/);
  });

  it("does not require a URL — that is toPlaywrightConfig's concern", () => {
    expect(() => defineConfig({ routes: ["/"] })).not.toThrow();
  });

  it("rejects an unknown tier", () => {
    // @ts-expect-error deliberately invalid tier
    expect(() => defineConfig({ ...base, tier: "extreme" })).toThrow(/tier/);
  });

  it("rejects authedRoutes without auth", () => {
    expect(() => defineConfig({ ...base, authedRoutes: ["/dashboard"] })).toThrow(/auth/);
  });

  it("accepts authedRoutes when auth is present", () => {
    expect(() =>
      defineConfig({ ...base, authedRoutes: ["/dashboard"], auth: { storageState: "./s.json" } })
    ).not.toThrow();
  });
});

describe("tier resolution", () => {
  it("defaults to light", () => {
    expect(resolveTier(base)).toBe("light");
  });

  it("reads the config value", () => {
    expect(resolveTier({ ...base, tier: "full" })).toBe("full");
  });

  it("lets RESPONSIVE_TIER win over the config value", () => {
    process.env.RESPONSIVE_TIER = "medium";
    expect(resolveTier({ ...base, tier: "light" })).toBe("medium");
  });

  it("falls back to light for a junk env value", () => {
    process.env.RESPONSIVE_TIER = "sideways";
    expect(resolveTier(base)).toBe("light");
  });
});

describe("route resolution", () => {
  const grouped = {
    port: 3000,
    routes: { light: ["/"], medium: ["/pricing"], full: ["/blog"] },
  };

  it("returns a flat array at every tier", () => {
    const config = { port: 3000, routes: ["/", "/about"], tier: "light" as const };
    expect(resolveRoutes(config)).toEqual(["/", "/about"]);
  });

  it("is cumulative across tier groups", () => {
    expect(resolveRoutes({ ...grouped, tier: "light" })).toEqual(["/"]);
    expect(resolveRoutes({ ...grouped, tier: "medium" })).toEqual(["/", "/pricing"]);
    expect(resolveRoutes({ ...grouped, tier: "full" })).toEqual(["/", "/pricing", "/blog"]);
  });

  it("de-duplicates a route listed in two groups", () => {
    const config = { port: 3000, routes: { light: ["/"], medium: ["/"] }, tier: "medium" as const };
    expect(resolveRoutes(config)).toEqual(["/"]);
  });

  it("returns an empty list when there are no authed routes", () => {
    expect(resolveAuthedRoutes(base)).toEqual([]);
  });

  it("resolves authed routes with the same cumulative rules", () => {
    const config = {
      ...base,
      auth: { storageState: "./s.json" },
      authedRoutes: { light: ["/dashboard"], medium: ["/dashboard/billing"] },
      tier: "medium" as const,
    };
    expect(resolveAuthedRoutes(config)).toEqual(["/dashboard", "/dashboard/billing"]);
  });
});

describe("viewport resolution", () => {
  it("uses the cumulative breakpoint tiers by default", () => {
    expect(resolveViewports({ ...base, tier: "light" })).toEqual(BREAKPOINT_TIERS.light);
  });

  it("light covers every Tailwind v4 breakpoint", () => {
    const widths = resolveViewports({ ...base, tier: "light" }).map((v) => v.width);
    for (const breakpoint of [640, 768, 1024, 1280, 1536]) {
      expect(widths).toContain(breakpoint);
    }
  });

  it("medium adds the one-px-below boundary widths", () => {
    const widths = resolveViewports({ ...base, tier: "medium" }).map((v) => v.width);
    for (const edge of [639, 767, 1023, 1279, 1535]) {
      expect(widths).toContain(edge);
    }
  });

  it("appends extraViewports for the active tier", () => {
    const config = {
      ...base,
      tier: "light" as const,
      extraViewports: { light: [{ name: "kiosk", width: 1080, height: 1920 }] },
    };
    expect(resolveViewports(config)).toContainEqual({ name: "kiosk", width: 1080, height: 1920 });
  });

  it("does not include extraViewports from a higher tier", () => {
    const config = {
      ...base,
      tier: "light" as const,
      extraViewports: { full: [{ name: "wall", width: 3840, height: 2160 }] },
    };
    expect(resolveViewports(config).some((v) => v.name === "wall")).toBe(false);
  });

  it("replaces the built-ins entirely when viewports is given", () => {
    const config = {
      ...base,
      tier: "light" as const,
      viewports: { light: [{ name: "only", width: 500, height: 500 }] },
    };
    expect(resolveViewports(config)).toEqual([{ name: "only", width: 500, height: 500 }]);
  });

  it("de-duplicates viewports that share dimensions", () => {
    const config = {
      ...base,
      tier: "light" as const,
      extraViewports: { light: [{ name: "duplicate-of-md", width: 768, height: 1024 }] },
    };
    const matches = resolveViewports(config).filter((v) => v.width === 768 && v.height === 1024);
    expect(matches).toHaveLength(1);
  });
});

describe("baseURL and storage paths", () => {
  it("builds a URL from port and default host", () => {
    expect(resolveBaseURL({ port: 4321, routes: ["/"] })).toBe("http://localhost:4321");
  });

  it("honours an explicit host", () => {
    expect(resolveBaseURL({ port: 8000, host: "127.0.0.1", routes: ["/"] })).toBe(
      "http://127.0.0.1:8000"
    );
  });

  it("prefers baseURL and strips a trailing slash", () => {
    expect(resolveBaseURL({ baseURL: "https://example.com/", port: 3000, routes: ["/"] })).toBe(
      "https://example.com"
    );
  });

  it("defaults the session file into the artifact directory", () => {
    expect(authStoragePath(base)).toBe(".playwright/auth/state.json");
  });

  it("uses an explicit storageState path when given", () => {
    expect(authStoragePath({ ...base, auth: { storageState: "./mine.json" } })).toBe("./mine.json");
  });
});

describe("toPlaywrightConfig", () => {
  it("throws when it cannot determine a base URL", () => {
    expect(() => toPlaywrightConfig({ routes: ["/"] })).toThrow(/port.*baseURL/s);
  });

  it("returns undefined baseURL only via resolveBaseURL, not a broken config", () => {
    expect(resolveBaseURL({ routes: ["/"] })).toBeUndefined();
  });

  it("keeps every artifact under one directory", () => {
    expect(toPlaywrightConfig(base).outputDir).toBe(".playwright/test-results");
  });

  it("honours a custom outputDir", () => {
    expect(toPlaywrightConfig({ ...base, outputDir: ".ci-artifacts" }).outputDir).toBe(
      ".ci-artifacts/test-results"
    );
  });

  it("omits webServer when there is no startCommand", () => {
    expect(toPlaywrightConfig(base).webServer).toBeUndefined();
  });

  it("wires webServer to the resolved baseURL", () => {
    const result = toPlaywrightConfig({ ...base, startCommand: "npm run dev" });
    expect(result.webServer).toMatchObject({
      command: "npm run dev",
      url: "http://localhost:3000",
    });
  });

  it("never sets globalSetup — auth runs from the spec, so the package stays CJS-loadable", () => {
    expect(toPlaywrightConfig(base).globalSetup).toBeUndefined();
    expect(
      toPlaywrightConfig({
        ...base,
        authedRoutes: ["/dashboard"],
        auth: { login: { url: "/login", username: "u", password: "p" } },
      }).globalSetup
    ).toBeUndefined();
  });

  it("passes basic auth and headers through to use", () => {
    const result = toPlaywrightConfig({
      ...base,
      auth: {
        httpCredentials: { username: "u", password: "p" },
        headers: { Authorization: "Bearer t" },
      },
    });
    expect(result.use).toMatchObject({
      httpCredentials: { username: "u", password: "p" },
      extraHTTPHeaders: { Authorization: "Bearer t" },
    });
  });
});
