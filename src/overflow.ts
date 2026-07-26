import { type Page } from "@playwright/test";

export type OverflowReport = {
  scrollWidth: number;
  clientWidth: number;
  offenders: { tag: string; id: string; cls: string; right: number; width: number }[];
};

/**
 * Pure DOM measurement: no screenshots, no image diffing. Compares
 * `document.documentElement.scrollWidth` against `clientWidth` and, when
 * they diverge, walks the body to find the elements whose bounding boxes
 * actually extend past the viewport's right edge — so failures point at a
 * specific element instead of just "something overflows."
 */
export async function overflowReport(page: Page): Promise<OverflowReport> {
  return page.evaluate((): OverflowReport => {
    const docEl = document.documentElement;
    const clientWidth = docEl.clientWidth;
    const offenders: OverflowReport["offenders"] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.width > 20000) continue;
      if (r.left > clientWidth) continue;
      if (r.right > clientWidth + 1) {
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

    return { scrollWidth: docEl.scrollWidth, clientWidth, offenders: offenders.slice(0, 8) };
  });
}
