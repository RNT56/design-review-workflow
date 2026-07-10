import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type AuditTargetPolicy = {
  allowPrivateTargets?: boolean;
  allowNonStandardPorts?: boolean;
};

export async function assertSafeAuditTarget(rawUrl: string, policy: AuditTargetPolicy = {}): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Audit targets must use http or https.");
  if (url.username || url.password) throw new Error("Audit targets must not include URL credentials.");
  if (!policy.allowNonStandardPorts && url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("Audit targets must use the standard HTTP or HTTPS port.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (policy.allowPrivateTargets) return url;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Private and local audit targets are not allowed.");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Audit target resolves to a private, loopback, link-local, or reserved address.");
  }
  return url;
}

export async function validateRedirectChain(rawUrl: string, policy: AuditTargetPolicy = {}, maxRedirects = 5): Promise<string[]> {
  const chain: string[] = [];
  let current = rawUrl;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const safe = await assertSafeAuditTarget(current, policy);
    chain.push(safe.toString());
    const response = await fetch(safe, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml", Range: "bytes=0-0" },
      signal: AbortSignal.timeout(8_000)
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status < 300 || response.status >= 400) return chain;
    const location = response.headers.get("location");
    if (!location) return chain;
    current = new URL(location, safe).toString();
  }
  throw new Error(`Audit target exceeded ${maxRedirects} redirects.`);
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const [a, b, c] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("2001:db8:");
  }
  return true;
}
