import { describe, it, expect } from "vitest";
import { cumulative, BREAKPOINT_TIERS } from "../src/viewports.js";

describe("cumulative", () => {
  it("returns only light viewports for 'light'", () => {
    const result = cumulative(BREAKPOINT_TIERS, "light");
    expect(result).toHaveLength(BREAKPOINT_TIERS.light.length);
    expect(result).toEqual(BREAKPOINT_TIERS.light);
  });

  it("returns light + medium viewports for 'medium'", () => {
    const result = cumulative(BREAKPOINT_TIERS, "medium");
    expect(result).toHaveLength(BREAKPOINT_TIERS.light.length + BREAKPOINT_TIERS.medium.length);
    expect(result).toEqual([...BREAKPOINT_TIERS.light, ...BREAKPOINT_TIERS.medium]);
  });

  it("returns light + medium + full viewports for 'full'", () => {
    const result = cumulative(BREAKPOINT_TIERS, "full");
    expect(result).toHaveLength(
      BREAKPOINT_TIERS.light.length + BREAKPOINT_TIERS.medium.length + BREAKPOINT_TIERS.full.length
    );
    expect(result).toEqual([...BREAKPOINT_TIERS.light, ...BREAKPOINT_TIERS.medium, ...BREAKPOINT_TIERS.full]);
  });

  it("falls back to light only for an unknown tier string", () => {
    const result = cumulative(BREAKPOINT_TIERS, "nonsense");
    expect(result).toEqual(BREAKPOINT_TIERS.light);
  });

  it("is genuinely cumulative, not a replacement — medium contains every light entry", () => {
    const mediumResult = cumulative(BREAKPOINT_TIERS, "medium");
    for (const v of BREAKPOINT_TIERS.light) {
      expect(mediumResult).toContainEqual(v);
    }
  });

  it("is genuinely cumulative — full contains every light and medium entry", () => {
    const fullResult = cumulative(BREAKPOINT_TIERS, "full");
    for (const v of [...BREAKPOINT_TIERS.light, ...BREAKPOINT_TIERS.medium]) {
      expect(fullResult).toContainEqual(v);
    }
  });
});
