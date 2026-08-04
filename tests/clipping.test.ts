import { chromium, type Browser, type Page } from "@playwright/test";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { AGENT_ENV_VARS, resolveClipping, resolveWebServerEnv } from "../src/config.js";
import { clippedReport, overflowReport, DEFAULT_CLIPPING_SELECTOR } from "../src/overflow.js";

const base = { port: 3000, routes: ["/"] };

describe("resolveClipping", () => {
  it("is enabled by default with the built-in selector", () => {
    const r = resolveClipping({ ...base });
    expect(r).toEqual({ enabled: true, selector: DEFAULT_CLIPPING_SELECTOR, ignore: [] });
  });

  it("clipping: false turns it off", () => {
    expect(resolveClipping({ ...base, clipping: false }).enabled).toBe(false);
  });

  it("inherits the top-level ignore list", () => {
    const r = resolveClipping({ ...base, ignore: ["#map-embed"] });
    expect(r.ignore).toEqual(["#map-embed"]);
  });

  it("merges its own ignore on top of the top-level one rather than replacing it", () => {
    const r = resolveClipping({
      ...base,
      ignore: ["#map-embed"],
      clipping: { ignore: [".marquee"] },
    });
    expect(r.ignore).toEqual(["#map-embed", ".marquee"]);
  });

  it("honours a custom selector", () => {
    expect(resolveClipping({ ...base, clipping: { selector: "h1" } }).selector).toBe("h1");
  });
});

describe("resolveWebServerEnv", () => {
  afterEach(() => {
    for (const key of AGENT_ENV_VARS) delete process.env[key];
    delete process.env.ROT_PROBE;
  });

  it("blanks a set agent variable so the server does not daemonize", () => {
    process.env.CLAUDECODE = "1";
    // Empty, not absent: Playwright merges these over process.env, so the key
    // cannot be deleted — and detection treats an empty value as absent anyway.
    expect(resolveWebServerEnv({ ...base }).CLAUDECODE).toBe("");
  });

  it("does not invent overrides for agent variables that are not set", () => {
    expect(resolveWebServerEnv({ ...base })).toEqual({});
  });

  it("returns overrides only — untouched vars come from Playwright's merge", () => {
    process.env.ROT_PROBE = "kept";
    expect(resolveWebServerEnv({ ...base }).ROT_PROBE).toBeUndefined();
  });

  it("lets a consumer put an agent variable back explicitly", () => {
    process.env.CLAUDECODE = "1";
    const env = resolveWebServerEnv({ ...base, webServerEnv: { CLAUDECODE: "1" } });
    expect(env.CLAUDECODE).toBe("1");
  });

  it("emulates unsetting a key with an empty string", () => {
    const env = resolveWebServerEnv({ ...base, webServerEnv: { ROT_PROBE: undefined } });
    expect(env.ROT_PROBE).toBe("");
  });
});

/**
 * Real layout engine, because this is the whole point: the clipped case is
 * invisible to geometry that only reads `scrollWidth`, so a fake DOM (which has
 * no layout at all) could not tell a passing page from a broken one.
 */
describe("clippedReport (real browser)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 640, height: 800 } });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  const CLIPPED = `
    <section style="overflow:hidden; display:flex; justify-content:center">
      <h1 style="white-space:nowrap; font-size:60px">A headline far wider than the viewport</h1>
    </section>`;

  it("the scrollWidth gate cannot see clipped overflow", async () => {
    await page.setContent(CLIPPED);
    const report = await overflowReport(page);

    // The element walk DOES notice the headline hanging past the right edge —
    // but `runOverflowCheck` never looks, because it returns early whenever
    // scrollWidth and clientWidth agree. That early return is the blind spot:
    // the measurement exists, the gate discards it.
    expect(report.offenders.length).toBeGreaterThan(0);
    expect(report.scrollWidth).toBe(report.clientWidth);
  });

  it("flags a headline cut off by an overflow-hidden ancestor", async () => {
    await page.setContent(CLIPPED);
    const { clipped } = await clippedReport(page);
    expect(clipped).toHaveLength(1);
    expect(clipped[0].tag).toBe("h1");
    expect(clipped[0].overflowPx).toBeGreaterThan(0);
    expect(clipped[0].clipper).toContain("section");
  });

  it("does not flag content that fits inside its clipping ancestor", async () => {
    await page.setContent(`
      <section style="overflow:hidden"><h1 style="font-size:16px">Short</h1></section>`);
    expect((await clippedReport(page)).clipped).toEqual([]);
  });

  it("ignores overflow-x: auto — scrollable content is reachable, not lost", async () => {
    await page.setContent(`
      <section style="overflow-x:auto; display:flex">
        <h1 style="white-space:nowrap; font-size:60px">A headline far wider than the viewport</h1>
      </section>`);
    expect((await clippedReport(page)).clipped).toEqual([]);
  });

  it("respects ignore selectors and counts what it suppressed", async () => {
    await page.setContent(`
      <section class="marquee" style="overflow:hidden; display:flex; justify-content:center">
        <h1 style="white-space:nowrap; font-size:60px">A headline far wider than the viewport</h1>
      </section>`);
    const report = await clippedReport(page, { ignore: [".marquee"] });
    expect(report.clipped).toEqual([]);
    expect(report.ignored).toBe(1);
  });

  it("does not flag decorative elements outside the default selector", async () => {
    await page.setContent(`
      <section style="overflow:hidden; display:flex; justify-content:center">
        <div style="width:2000px; height:40px; background:red"></div>
      </section>`);
    expect((await clippedReport(page)).clipped).toEqual([]);
  });

  it("survives an invalid selector instead of throwing", async () => {
    await page.setContent(CLIPPED);
    expect((await clippedReport(page, { selector: ":::nope" })).clipped).toEqual([]);
  });
});
