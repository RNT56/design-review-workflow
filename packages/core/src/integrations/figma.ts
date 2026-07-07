import * as path from "node:path";
import { configuredAuditRoot } from "../storage/audit-output.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { sanitizePath } from "../utils/url.js";

export type FigmaFetchOptions = {
  token?: string;
  fileKeyOrUrl: string;
  nodeIds?: string[];
  workspaceRoot?: string;
};

export type FigmaEvidence = {
  fileKey: string;
  fetchedAt: string;
  root: string;
  filePath?: string;
  nodesPath?: string;
  summaryPath: string;
  nodeIds: string[];
};

export function parseFigmaFileKey(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? trimmed;
}

export async function fetchFigmaEvidence(options: FigmaFetchOptions): Promise<FigmaEvidence> {
  const token = options.token ?? process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error("FIGMA_TOKEN is required for read-only Figma evidence fetches.");
  }
  const fileKey = parseFigmaFileKey(options.fileKeyOrUrl);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const fetchedAt = new Date().toISOString();
  const root = path.join(configuredAuditRoot(undefined, workspaceRoot), "figma", sanitizePath(fileKey), fetchedAt.replace(/[:.]/g, "-"));
  await ensureDir(root);

  const file = await figmaGet(token, `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`);
  const filePath = path.join(root, "file.json");
  await writeJson(filePath, file);

  let nodesPath: string | undefined;
  const nodeIds = options.nodeIds ?? [];
  if (nodeIds.length > 0) {
    const nodes = await figmaGet(token, `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeIds.join(","))}`);
    nodesPath = path.join(root, "nodes.json");
    await writeJson(nodesPath, nodes);
  }

  const summary = {
    fileKey,
    fetchedAt,
    name: file.name,
    lastModified: file.lastModified,
    version: file.version,
    topLevelPages: Array.isArray(file.document?.children)
      ? file.document.children.map((page: { name?: string; id?: string; type?: string }) => ({ id: page.id, name: page.name, type: page.type }))
      : [],
    nodeIds
  };
  const summaryPath = path.join(root, "summary.json");
  await writeJson(summaryPath, summary);

  return {
    fileKey,
    fetchedAt,
    root,
    filePath,
    nodesPath,
    summaryPath,
    nodeIds
  };
}

async function figmaGet(token: string, url: string): Promise<Record<string, any>> {
  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": token
    }
  });
  const text = await response.text();
  let json: Record<string, any>;
  try {
    json = JSON.parse(text) as Record<string, any>;
  } catch {
    json = { text };
  }
  if (!response.ok) {
    throw new Error(`Figma request failed with ${response.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}
