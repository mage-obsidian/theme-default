import type { BrowserContext, Page } from "@playwright/test";

/** What the injected probe leaves on the page for the assertions to read. */
interface ProbeIsland {
    i: number;
    el: Element;
    kids: Element[];
    component: string;
    strategy: string;
    declaresHydrate: boolean;
    inView: boolean;
    serverChildren: number;
    exempt: boolean;
}

interface ProbeFrame {
    t: number;
    seen: Record<string, 1>;
}

declare global {
    interface Window {
        __paint?: { islands: ProbeIsland[]; frames: ProbeFrame[] };
        __persisted?: boolean;
    }
}

/** The guest happy path, in the order a shopper walks it. */
export const happyPath = [
    { name: "home", path: "/" },
    { name: "plp", path: "/gear/bags.html" },
    { name: "pdp", path: "/joust-duffle-bag.html" },
    { name: "search", path: "/catalogsearch/result/?q=bag" },
    { name: "cart", path: "/checkout/cart/" },
    { name: "checkout", path: "/checkout/" },
];

/** Pages Varnish serves from cache, and which therefore may be restored on Back. */
export const cacheablePath = happyPath.filter((step) => !step.path.startsWith("/checkout"));

/**
 * The happy path plus the two product types whose buy box and availability panel
 * ship their own server snapshot: an out-of-stock product renders neither.
 */
export const hydrationPath = [
    ...happyPath.filter((step) => step.path !== "/checkout/"),
    { name: "pdp-in-stock", path: "/driven-backpack.html" },
    { name: "pdp-configurable", path: "/chaz-kangeroo-hoodie.html" },
];

export interface IslandReport {
    component: string;
    strategy: string;
    declaresHydrate: boolean;
    inView: boolean;
    serverChildren: number;
    survivedChildren: number;
    /**
     * The server markup is flagged `data-allow-mismatch`, meaning it is a state
     * the component may legitimately leave behind on its first render — a hint
     * the browser can contradict, not a claim about the component's output.
     */
    exempt: boolean;
}

export interface Blink {
    node: string;
    ms: number;
}

/**
 * Claims each island's server markup at DOMContentLoaded and samples, every
 * animation frame, which regions actually have paint in them. Both answers are
 * read back after mounting has settled.
 */
const PROBE = `
(() => {
  const key = (el) => {
    const parts = [];
    let node = el;
    for (let d = 0; node && node.nodeType === 1 && d < 3; d++, node = node.parentElement) {
      const cls = (node.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean)[0];
      parts.unshift(node.tagName.toLowerCase() + (node.id ? '#' + node.id : cls ? '.' + cls : ''));
    }
    return parts.join('>');
  };

  const state = { islands: [], frames: [] };
  window.__paint = state;

  const claim = () => {
    state.islands = [...document.querySelectorAll('[data-mage-island]')].map((el, i) => {
      const kids = [...el.children];
      kids.forEach((k) => { k.__claim = i; });
      const rect = el.getBoundingClientRect();
      return {
        i,
        el,
        kids,
        component: (el.dataset.component || '').split('/generated/')[1] || '?',
        strategy: el.dataset.strategy || 'visible',
        declaresHydrate: 'hydrate' in el.dataset,
        inView: rect.top < innerHeight && rect.bottom > 0 && rect.width > 0 && rect.height > 0,
        serverChildren: kids.length,
        exempt: kids.some((k) => k.hasAttribute && k.hasAttribute('data-allow-mismatch')),
      };
    });
  };

  const sample = () => {
    const seen = {};
    for (const el of document.querySelectorAll('header *, [data-mage-island], [data-mage-island] *')) {
      const rect = el.getBoundingClientRect();
      if (rect.top >= innerHeight || rect.bottom <= 0) continue;
      if (rect.width <= 2 || rect.height <= 2) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      seen[key(el) + '|' + (el.textContent || '').trim().slice(0, 40)] = 1;
    }
    state.frames.push({ t: Math.round(performance.now()), seen });
    if (performance.now() < 4000) requestAnimationFrame(sample);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', claim, { once: true });
  else claim();
  requestAnimationFrame(sample);
})();
`;

export async function installPaintProbe(context: BrowserContext): Promise<void> {
    await context.addInitScript(PROBE);
}

/** Slows the machine down to where the gap between paint and mount is visible. */
export async function throttle(context: BrowserContext, page: Page, rate = 4): Promise<void> {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

export const settle = (page: Page, ms = 4200): Promise<void> => page.waitForTimeout(ms);

export const readIslands = (page: Page): Promise<IslandReport[]> =>
    page.evaluate(() =>
        (window.__paint?.islands ?? []).map((r): IslandReport => ({
            component: r.component,
            strategy: r.strategy,
            declaresHydrate: r.declaresHydrate,
            inView: r.inView,
            serverChildren: r.serverChildren,
            exempt: r.exempt,
            survivedChildren: r.kids.filter(
                (k) => k.isConnected && (k as Element & { __claim?: number }).__claim === r.i,
            ).length,
        })),
    );

/**
 * Regions that were painted, then were not, then were again. A region that only
 * ever arrives is late content; one that comes and goes is the blank tick.
 */
export const readBlinks = (page: Page): Promise<Blink[]> =>
    page.evaluate(() => {
        const frames = window.__paint?.frames ?? [];
        const life = new Map<string, number[]>();
        frames.forEach((frame, i) => {
            for (const k of Object.keys(frame.seen)) {
                if (!life.has(k)) life.set(k, []);
                life.get(k)!.push(i);
            }
        });
        const last = frames.length - 1;
        const blinks: Blink[] = [];
        for (const [node, idx] of life) {
            if (idx[idx.length - 1] !== last) continue;
            let ms = 0;
            for (let i = 1; i < idx.length; i++) {
                if (idx[i] !== idx[i - 1] + 1) ms += frames[idx[i]].t - frames[idx[i - 1]].t;
            }
            if (ms > 0) blinks.push({ node, ms });
        }
        return blinks.sort((a, b) => b.ms - a.ms);
    });
