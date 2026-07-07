import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import { createAuditPaths } from "../storage/project.js";
import { captureEvidence } from "./capture.js";

describe("captureEvidence", () => {
  it("settles scroll-reveal content before full-page screenshots", async () => {
    const fixture = await startScrollRevealFixture();
    try {
      const root = await mkdtemp(path.join(tmpdir(), "wdr-capture-"));
      const config = {
        ...createAuditConfig({
          url: fixture.url,
          maxPages: 1,
          outputPdf: false,
          outputHtml: false,
          outputJson: true,
          outputMarkdown: false
        }),
        auditId: "scan_reveal",
        viewports: [
          {
            name: "desktop" as const,
            width: 900,
            height: 600,
            deviceScaleFactor: 1,
            isMobile: false
          }
        ],
        capture: {
          settleScroll: true,
          reducedMotion: true,
          waitForImages: true,
          maxScrollPasses: 2,
          scrollStepRatio: 0.75,
          stepDelayMs: 80,
          settleTimeoutMs: 2500
        }
      };
      const paths = await createAuditPaths(config, root);
      const result = await captureEvidence(config, paths);
      const page = result.pages[0];
      const fullPage = Object.values(page.screenshots).find((screenshot) => screenshot.kind === "full_page");
      expect(fullPage).toBeDefined();

      const png = PNG.sync.read(await readFile(path.join(paths.auditRoot, fullPage!.path)));
      const pixel = rgbaAt(png, 120, 1130);

      expect(pixel.r).toBeLessThan(40);
      expect(pixel.g).toBeGreaterThan(90);
      expect(pixel.b).toBeGreaterThan(120);
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it("captures safe interaction states without triggering unsafe actions", async () => {
    const fixture = await startInteractionFixture();
    try {
      const root = await mkdtemp(path.join(tmpdir(), "wdr-interactions-"));
      const baseConfig = createAuditConfig({
        url: fixture.url,
        maxPages: 1,
        outputPdf: false,
        outputHtml: false,
        outputJson: true,
        outputMarkdown: false
      });
      const config = {
        ...baseConfig,
        auditId: "scan_interactions",
        viewports: [
          {
            name: "desktop" as const,
            width: 960,
            height: 720,
            deviceScaleFactor: 1,
            isMobile: false
          }
        ],
        capture: {
          ...baseConfig.capture,
          settleScroll: true,
          stepDelayMs: 40,
          settleTimeoutMs: 1500
        },
        interactions: {
          ...baseConfig.interactions,
          maxStateCapturesPerPage: 6,
          maxStateCapturesPerViewport: 6
        }
      };
      const paths = await createAuditPaths(config, root);
      const result = await captureEvidence(config, paths);
      const page = result.pages[0];
      const categories = page.interactionStates.map((state) => state.category);
      const labels = page.interactionStates.map((state) => state.label.toLowerCase());
      const stateScreenshots = Object.values(page.screenshots).filter((screenshot) => screenshot.kind === "state");

      expect(categories).toEqual(expect.arrayContaining(["navigation", "dialog", "accordion", "tab"]));
      expect(labels.join(" ")).not.toMatch(/delete|buy|login|send message/);
      expect(stateScreenshots).toHaveLength(page.interactionStates.length);

      for (const state of page.interactionStates) {
        const screenshot = page.screenshots[state.screenshotId];
        expect(screenshot).toBeDefined();
        await expect(readFile(path.join(paths.auditRoot, screenshot.path))).resolves.toBeInstanceOf(Buffer);
      }
    } finally {
      await fixture.close();
    }
  }, 30_000);
});

async function startScrollRevealFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scroll Reveal Fixture</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #12202a; background: #ffffff; }
    .hero { height: 900px; display: grid; align-content: center; padding: 0 80px; background: #f6fafc; }
    .hero h1 { max-width: 680px; font-size: 64px; line-height: 1; margin: 0; }
    .reveal-card {
      height: 260px;
      margin: 120px 80px 80px;
      padding: 32px;
      color: #ffffff;
      background: #0e7490;
      opacity: 0;
      transform: translateY(64px);
      transition: opacity 80ms linear, transform 80ms linear;
    }
    .reveal-card.is-visible { opacity: 1; transform: none; }
    .tail { height: 500px; }
    @media (prefers-reduced-motion: reduce) {
      .reveal-card { transition: none; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Capture should not freeze unrevealed content.</h1>
      <a href="#proof">See proof</a>
    </section>
    <section id="proof" class="reveal-card">
      <h2>Revealed proof section</h2>
      <p>This block starts fully transparent and becomes visible only after scrolling intersects it.</p>
    </section>
    <div class="tail"></div>
  </main>
  <script>
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      }
    }, { threshold: 0.25 });
    for (const element of document.querySelectorAll('.reveal-card')) observer.observe(element);
  </script>
</body>
</html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not expose a TCP port.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server)
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function rgbaAt(png: PNG, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const index = (png.width * y + x) << 2;
  return {
    r: png.data[index],
    g: png.data[index + 1],
    b: png.data[index + 2],
    a: png.data[index + 3]
  };
}

async function startInteractionFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Interaction Fixture</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #1a242f; background: #f8fafc; }
    header { display: flex; gap: 16px; align-items: center; padding: 24px 32px; background: #ffffff; border-bottom: 1px solid #d7dee7; }
    main { padding: 32px; display: grid; gap: 24px; max-width: 860px; }
    button, summary { min-height: 44px; padding: 10px 14px; border: 1px solid #8da0b8; background: #ffffff; color: #102033; }
    .panel, .dialog, .tab-panel { margin-top: 12px; padding: 18px; border: 2px solid #1d4ed8; background: #eaf2ff; }
    [hidden] { display: none !important; }
    .unsafe { display: flex; gap: 12px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <header>
    <button id="menu-button" aria-expanded="false" aria-controls="site-menu">Menu</button>
    <nav id="site-menu" class="panel" hidden>
      <a href="#work">Work</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <h1>Interaction states should become visual evidence.</h1>
    <button id="dialog-button" aria-haspopup="dialog" aria-controls="about-dialog">Open details dialog</button>
    <section id="about-dialog" class="dialog" role="dialog" aria-modal="true" hidden>
      <h2>Project details dialog</h2>
      <p>This modal-like panel is safe to inspect and should be captured.</p>
    </section>
    <details>
      <summary>Project FAQ details</summary>
      <p>The details element should be captured as an accordion-style state.</p>
    </details>
    <section>
      <button role="tab" id="tab-button" aria-selected="false" aria-controls="tab-panel">Case study tab</button>
      <div id="tab-panel" class="tab-panel" role="tabpanel" hidden>Tabbed case study content.</div>
    </section>
    <section class="unsafe">
      <form><button type="submit">Send message</button></form>
      <button>Delete project</button>
      <button>Buy now</button>
      <a href="/login">Login</a>
    </section>
  </main>
  <script>
    document.getElementById('menu-button').addEventListener('click', () => {
      const menu = document.getElementById('site-menu');
      const open = menu.hasAttribute('hidden');
      menu.toggleAttribute('hidden', !open);
      document.getElementById('menu-button').setAttribute('aria-expanded', String(open));
    });
    document.getElementById('dialog-button').addEventListener('click', () => {
      document.getElementById('about-dialog').hidden = false;
    });
    document.getElementById('tab-button').addEventListener('click', () => {
      document.getElementById('tab-panel').hidden = false;
      document.getElementById('tab-button').setAttribute('aria-selected', 'true');
    });
  </script>
</body>
</html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not expose a TCP port.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server)
  };
}
