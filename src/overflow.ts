import { type Page } from "@playwright/test";

export type Offender = {
  tag: string;
  id: string;
  cls: string;
  right: number;
  width: number;
};

export type OverflowReport = {
  scrollWidth: number;
  clientWidth: number;
  offenders: Offender[];
  /** Offenders suppressed by an `ignore` selector. */
  ignored: number;
};

/** An element cut off by a clipping ancestor rather than pushed past the viewport. */
export type ClippedOffender = {
  tag: string;
  id: string;
  cls: string;
  /** How far past the clipping ancestor's box the element extends, in px. */
  overflowPx: number;
  /** Which side is cut — `right`, `left`, or `both`. */
  side: "left" | "right" | "both";
  /** Description of the ancestor doing the clipping. */
  clipper: string;
};

export type ClippedReport = {
  clipped: ClippedOffender[];
  /** Clipped elements suppressed by an `ignore` selector. */
  ignored: number;
};

/**
 * Text-bearing block elements — the ones where being clipped actually destroys
 * information a reader needed. Deliberately excludes `div`, `span`, `a` and
 * `img`: full-bleed decorative elements sitting inside an `overflow-hidden`
 * wrapper are a normal, intentional pattern, and including them turns this
 * check into noise.
 */
export const DEFAULT_CLIPPING_SELECTOR =
  "h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, table, pre, dt, dd";

/**
 * Pure DOM measurement: no screenshots, no image diffing. Compares
 * `document.documentElement.scrollWidth` against `clientWidth` and, when they
 * diverge, walks the body to find the elements whose bounding boxes actually
 * extend past the viewport's right edge — so failures point at a specific
 * element instead of just "something overflows."
 *
 * `ignore` accepts CSS selectors; an element matching one, or nested inside
 * one, is excluded from the offender list.
 */
export async function overflowReport(page: Page, ignore: string[] = []): Promise<OverflowReport> {
  return page.evaluate((ignoreSelectors: string[]): OverflowReport => {
    const docEl = document.documentElement;
    const clientWidth = docEl.clientWidth;
    const offenders: Offender[] = [];
    let ignored = 0;

    const isIgnored = (el: HTMLElement): boolean => {
      for (const sel of ignoreSelectors) {
        try {
          if (el.matches(sel) || el.closest(sel)) return true;
        } catch {
          // Invalid selector — treat as non-matching rather than exploding.
        }
      }
      return false;
    };

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.width > 20000) continue;
      if (r.left > clientWidth) continue;
      if (r.right > clientWidth + 1) {
        if (ignoreSelectors.length > 0 && isIgnored(el)) {
          ignored++;
          continue;
        }
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id ? `#${el.id}` : "",
          cls: (typeof el.className === "string" ? el.className : "").trim().slice(0, 80),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }

    offenders.sort((a, b) => b.right - a.right);

    return { scrollWidth: docEl.scrollWidth, clientWidth, offenders: offenders.slice(0, 8), ignored };
  }, ignore);
}

/**
 * Finds elements cut off by an ancestor that clips rather than scrolls.
 *
 * `overflowReport` cannot see these: when an ancestor carries
 * `overflow-x: hidden`, a child wider than that ancestor is truncated instead
 * of producing a scrollbar, so `documentElement.scrollWidth` stays exactly
 * equal to `clientWidth` and the page passes while visibly losing text.
 *
 * Measurement is the same kind as the primary check — compare an element's
 * border box against the box of the nearest ancestor that clips it — so it
 * stays deterministic and needs no human to adjudicate. Only `hidden` and
 * `clip` count as clipping; `auto` and `scroll` leave the content reachable.
 */
export async function clippedReport(
  page: Page,
  options: { selector?: string; ignore?: string[]; tolerancePx?: number } = {}
): Promise<ClippedReport> {
  const selector = options.selector ?? DEFAULT_CLIPPING_SELECTOR;
  const ignore = options.ignore ?? [];
  const tolerancePx = options.tolerancePx ?? 1;

  return page.evaluate(
    ({
      selector: sel,
      ignoreSelectors,
      tolerance,
    }: {
      selector: string;
      ignoreSelectors: string[];
      tolerance: number;
    }): ClippedReport => {
      const clipped: ClippedOffender[] = [];
      let ignored = 0;

      const isIgnored = (el: HTMLElement): boolean => {
        for (const s of ignoreSelectors) {
          try {
            if (el.matches(s) || el.closest(s)) return true;
          } catch {
            // Invalid selector — treat as non-matching rather than exploding.
          }
        }
        return false;
      };

      const describe = (el: HTMLElement): string => {
        const id = el.id ? `#${el.id}` : "";
        const cls = (typeof el.className === "string" ? el.className : "").trim().slice(0, 60);
        return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls.split(/\s+/).filter(Boolean).join(".")}` : ""}`;
      };

      /** Nearest ancestor that actually cuts content off on the horizontal axis. */
      const clippingAncestor = (el: HTMLElement): HTMLElement | null => {
        let node = el.parentElement;
        while (node && node !== document.documentElement) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === "hidden" || overflowX === "clip") return node;
          node = node.parentElement;
        }
        return null;
      };

      let candidates: HTMLElement[];
      try {
        candidates = Array.from(document.body.querySelectorAll<HTMLElement>(sel));
      } catch {
        return { clipped: [], ignored: 0 };
      }

      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;

        const clipper = clippingAncestor(el);
        if (!clipper) continue;

        const c = clipper.getBoundingClientRect();
        const overRight = r.right - c.right;
        const overLeft = c.left - r.left;
        if (overRight <= tolerance && overLeft <= tolerance) continue;

        if (ignoreSelectors.length > 0 && (isIgnored(el) || isIgnored(clipper))) {
          ignored++;
          continue;
        }

        const side =
          overRight > tolerance && overLeft > tolerance
            ? "both"
            : overRight > tolerance
              ? "right"
              : "left";

        clipped.push({
          tag: el.tagName.toLowerCase(),
          id: el.id ? `#${el.id}` : "",
          cls: (typeof el.className === "string" ? el.className : "").trim().slice(0, 80),
          overflowPx: Math.round(Math.max(overRight, overLeft)),
          side,
          clipper: describe(clipper),
        });
      }

      clipped.sort((a, b) => b.overflowPx - a.overflowPx);
      return { clipped: clipped.slice(0, 8), ignored };
    },
    { selector, ignoreSelectors: ignore, tolerance: tolerancePx }
  );
}
