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
