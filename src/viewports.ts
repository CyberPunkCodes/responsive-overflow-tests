import type { Tier, Viewport } from "./types.js";

/**
 * Synthetic viewport sizes anchored to Tailwind v4's default breakpoints
 * (sm 640, md 768, lg 1024, xl 1280, 2xl 1536), plus a few boundary/stress
 * sizes. Cumulative: `medium` includes `light`, `full` includes `medium`.
 */
export const BREAKPOINT_TIERS: Record<Tier, Viewport[]> = {
  light: [
    { name: "mobile-360", width: 360, height: 800 },
    { name: "sm-640", width: 640, height: 900 },
    { name: "md-768", width: 768, height: 1024 },
    { name: "xl-1280", width: 1280, height: 900 },
  ],
  medium: [
    { name: "mobile-320", width: 320, height: 568 },
    { name: "phone-414", width: 414, height: 896 },
    { name: "lg-1024", width: 1024, height: 768 },
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "2xl-1536", width: 1536, height: 960 },
  ],
  full: [
    { name: "fold-280", width: 280, height: 653 },
    { name: "fhd-1920", width: 1920, height: 1080 },
    { name: "qhd-2560", width: 2560, height: 1440 },
  ],
};

/**
 * Real-device viewport sizes, bucketed into the same light/medium/full
 * tiers. Mirrors the device matrix maintained in the
 * `frontend-screenshot-verification` plugin's `devices.json`
 * (CyberPunkCodes/claude-dev-plugins) — keep the two in sync by hand when
 * that file changes. `dpr` from that source is intentionally dropped since
 * only viewport width/height affect overflow detection.
 */
export const DEVICE_TIERS: Record<Tier, Viewport[]> = {
  light: [
    { name: "iPhone 16", width: 393, height: 852 },
    { name: "Samsung Galaxy S25", width: 360, height: 780 },
    { name: "Desktop 2xl breakpoint", width: 1536, height: 960 },
    { name: "Ultrawide (3440x1440)", width: 3440, height: 1440 },
  ],
  medium: [
    { name: "iPhone 16 Pro Max / 17 Pro Max", width: 440, height: 956 },
    { name: "Samsung Galaxy S25 Ultra / S26 Ultra", width: 412, height: 915 },
    { name: "Google Pixel 10 / 10a", width: 411, height: 923 },
    { name: "iPad Air 11in / Pro 11in (landscape)", width: 1194, height: 834 },
    { name: "Desktop xl breakpoint", width: 1280, height: 900 },
    { name: "Desktop FHD (1920x1080)", width: 1920, height: 1080 },
  ],
  full: [
    { name: "iPhone 17 / iPhone 16 Pro / iPhone 17 Pro", width: 402, height: 874 },
    { name: "iPhone 17 Air", width: 420, height: 912 },
    { name: "iPhone 16 Plus", width: 430, height: 932 },
    { name: "Samsung Galaxy S26+", width: 384, height: 854 },
    { name: "Samsung Galaxy S26", width: 360, height: 800 },
    { name: "Samsung Galaxy S25+ / S25 Edge", width: 412, height: 891 },
    { name: "Google Pixel 10 Pro", width: 427, height: 952 },
    { name: "Google Pixel 10 Pro XL", width: 448, height: 968 },
    { name: "Samsung Galaxy Z Fold 7 (Inner)", width: 984, height: 1092 },
    { name: "Google Pixel 9 Pro Fold (Inner)", width: 840, height: 820 },
    { name: "iPad Mini (portrait)", width: 744, height: 1133 },
    { name: "Google Pixel Tablet / Galaxy Tab S11 / Tab S10 (11in)", width: 800, height: 1280 },
    { name: "Samsung Galaxy Tab S11 Ultra / Tab S10 Ultra (14.6in)", width: 924, height: 1480 },
    { name: "OnePlus Pad 2 (12.1in)", width: 1060, height: 1500 },
    { name: "Generic tightest mobile (stress test)", width: 320, height: 800 },
  ],
};

const TIER_ORDER: Tier[] = ["light", "medium", "full"];

/**
 * Resolves a tier name to the cumulative viewport list (light..tier).
 * An unrecognized/invalid tier string falls back to `light` only.
 */
export function cumulative(tiers: Record<Tier, Viewport[]>, tier: string): Viewport[] {
  const idx = TIER_ORDER.indexOf(tier as Tier);
  const upTo = idx === -1 ? 0 : idx;

  const result: Viewport[] = [];
  for (let i = 0; i <= upTo; i++) {
    result.push(...tiers[TIER_ORDER[i]]);
  }
  return result;
}
