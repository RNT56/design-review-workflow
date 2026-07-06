export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function sameSite(candidate: string, start: string, includeSubdomains: boolean): boolean {
  const candidateHost = new URL(candidate).hostname.replace(/^www\./, "");
  const startHost = new URL(start).hostname.replace(/^www\./, "");
  return includeSubdomains ? candidateHost === startHost || candidateHost.endsWith(`.${startHost}`) : candidateHost === startHost;
}

export function slugFromUrl(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname === "/" ? "root" : parsed.pathname.replace(/^\//, "");
  return sanitizePath(`${host}-${path}`).slice(0, 90) || "page";
}

export function siteSlug(url: string): string {
  return sanitizePath(new URL(url).hostname.replace(/^www\./, ""));
}

export function sanitizePath(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isExcluded(url: string, patterns: string[]): boolean {
  const parsed = new URL(url);
  const haystack = `${parsed.pathname}${parsed.search}`.toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}
