import { describe, expect, it } from "vitest";
import { parseFigmaFileKey } from "./figma.js";

describe("parseFigmaFileKey", () => {
  it("extracts file keys from Figma URLs", () => {
    expect(parseFigmaFileKey("https://www.figma.com/design/AbC12345/My-File?node-id=1-2")).toBe("AbC12345");
  });

  it("accepts raw keys", () => {
    expect(parseFigmaFileKey("AbC12345")).toBe("AbC12345");
  });
});
