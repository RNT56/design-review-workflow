import { describe, expect, it } from "vitest";
import { assertSafeAuditTarget, isPrivateAddress } from "./network-policy.js";

describe("audit target network policy", () => {
  it("classifies private and reserved addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "100.64.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "::1", "fc00::1", "fe80::1", "2001:db8::1"]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects local targets, credentials, and non-standard ports by default", async () => {
    await expect(assertSafeAuditTarget("http://127.0.0.1/")).rejects.toThrow(/private|local/i);
    await expect(assertSafeAuditTarget("https://user:pass@example.com/")).rejects.toThrow(/credentials/i);
    await expect(assertSafeAuditTarget("https://example.com:8443/")).rejects.toThrow(/standard/i);
  });

  it("supports an explicit local-fixture policy", async () => {
    await expect(assertSafeAuditTarget("http://127.0.0.1:4173/", { allowPrivateTargets: true, allowNonStandardPorts: true })).resolves.toBeInstanceOf(URL);
  });
});
