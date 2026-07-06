import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMonitorConfig, sampleMonitorConfig } from "./monitor.js";

describe("monitor config", () => {
  it("loads yaml monitor configs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-monitor-"));
    const file = path.join(root, "monitor.yaml");
    await writeFile(file, "monitors:\n  - name: Example\n    url: https://example.com\n    maxPages: 1\n", "utf8");
    const config = await loadMonitorConfig(file);
    expect(config.monitors[0].url).toBe("https://example.com");
  });

  it("provides a sample config", () => {
    expect(sampleMonitorConfig().monitors).toHaveLength(1);
  });
});
