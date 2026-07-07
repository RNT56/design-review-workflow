import type { Page } from "playwright";
import type { CaptureSettings } from "../schemas/audit.js";

type ScrollMetrics = {
  height: number;
  viewportHeight: number;
  maxScrollY: number;
};

const MAX_SCROLL_STEPS = 80;
const MIN_SCROLL_STEP_PX = 180;

export async function settlePageForCapture(page: Page, settings: CaptureSettings): Promise<void> {
  await waitForRenderFrames(page);
  await waitForPageAssets(page, settings);
  await waitForFiniteAnimations(page, settings);

  if (settings.settleScroll) {
    await scrollThroughPage(page, settings);
    await waitForPageAssets(page, settings);
    await waitForFiniteAnimations(page, settings);
  }

  await resetScrollPosition(page);
  await waitForRenderFrames(page);
  await waitForFiniteAnimations(page, {
    ...settings,
    settleTimeoutMs: Math.min(settings.settleTimeoutMs, 1200)
  });
}

export async function resetScrollPosition(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
}

async function scrollThroughPage(page: Page, settings: CaptureSettings): Promise<void> {
  let previousHeight: number | undefined;
  for (let pass = 0; pass < settings.maxScrollPasses; pass += 1) {
    const metrics = await pageMetrics(page);
    if (metrics.maxScrollY <= 0) {
      return;
    }
    previousHeight ??= metrics.height;

    const positions = scrollPositions(metrics, settings.scrollStepRatio);
    for (const top of positions) {
      await page.evaluate((y) => window.scrollTo(0, y), top).catch(() => undefined);
      await waitForRenderFrames(page);
      if (settings.stepDelayMs > 0) {
        await page.waitForTimeout(settings.stepDelayMs);
      }
    }

    await waitForRenderFrames(page);
    await waitForNetworkQuiet(page, Math.min(settings.settleTimeoutMs, 2000));
    const nextHeight = (await pageMetrics(page)).height;
    if (Math.abs(nextHeight - previousHeight) < 2) {
      break;
    }
    previousHeight = nextHeight;
  }
}

async function pageMetrics(page: Page): Promise<ScrollMetrics> {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const height = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      html?.clientHeight ?? 0,
      html?.scrollHeight ?? 0,
      html?.offsetHeight ?? 0
    );
    const viewportHeight = Math.max(1, window.innerHeight || html.clientHeight || 1);
    return {
      height,
      viewportHeight,
      maxScrollY: Math.max(0, height - viewportHeight)
    };
  });
}

function scrollPositions(metrics: ScrollMetrics, stepRatio: number): number[] {
  const step = Math.max(MIN_SCROLL_STEP_PX, Math.floor(metrics.viewportHeight * stepRatio));
  const positions: number[] = [];
  for (let y = 0; y < metrics.maxScrollY; y += step) {
    positions.push(y);
  }
  positions.push(metrics.maxScrollY);

  const unique = [...new Set(positions.map((value) => Math.max(0, Math.round(value))))];
  if (unique.length <= MAX_SCROLL_STEPS) {
    return unique;
  }

  return Array.from({ length: MAX_SCROLL_STEPS }, (_, index) => {
    const ratio = index / Math.max(1, MAX_SCROLL_STEPS - 1);
    return Math.round(metrics.maxScrollY * ratio);
  });
}

async function waitForPageAssets(page: Page, settings: CaptureSettings): Promise<void> {
  await Promise.all([
    waitForNetworkQuiet(page, Math.min(settings.settleTimeoutMs, 2500)),
    page.evaluate(
      async ({ timeoutMs, waitForImages }) => {
        const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
        const waits: Promise<unknown>[] = [];

        const fonts = "fonts" in document ? document.fonts : undefined;
        if (fonts?.ready) {
          waits.push(fonts.ready.catch(() => undefined));
        }

        if (waitForImages) {
          const images = Array.from(document.images)
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .slice(0, 120);
          waits.push(Promise.all(images.map(waitForImage)).catch(() => undefined));
        }

        await Promise.race([Promise.all(waits), timeout]);

        function waitForImage(image: HTMLImageElement): Promise<void> {
          if (image.complete && image.naturalWidth > 0) {
            return Promise.resolve();
          }
          if (typeof image.decode === "function") {
            return image.decode().catch(() => undefined);
          }
          return new Promise((resolve) => {
            const done = () => resolve();
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", done, { once: true });
          });
        }
      },
      { timeoutMs: settings.settleTimeoutMs, waitForImages: settings.waitForImages }
    ).catch(() => undefined)
  ]);
}

async function waitForFiniteAnimations(page: Page, settings: CaptureSettings): Promise<void> {
  await page.evaluate(
    async ({ timeoutMs }) => {
      const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
      const animationRoots = [document.documentElement, document.body, ...Array.from(document.querySelectorAll("body *")).slice(0, 500)].filter(
        Boolean
      ) as Element[];
      const animations = animationRoots
        .flatMap((element) => element.getAnimations())
        .filter((animation) => {
          if (animation.playState === "finished" || animation.playState === "idle") return false;
          const timing = animation.effect?.getComputedTiming();
          if (!timing) return false;
          const endTime = Number(timing.endTime);
          return Number.isFinite(endTime) && endTime > 0 && endTime <= timeoutMs;
        })
        .slice(0, 120);

      await Promise.race([Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))), timeout]);
    },
    { timeoutMs: Math.min(settings.settleTimeoutMs, 2500) }
  ).catch(() => undefined);
}

async function waitForRenderFrames(page: Page): Promise<void> {
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    )
    .catch(() => undefined);
}

async function waitForNetworkQuiet(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
}
