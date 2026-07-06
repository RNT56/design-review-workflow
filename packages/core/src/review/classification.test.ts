import { describe, expect, it } from "vitest";
import { classifyPage, inferWebsiteType } from "./classification.js";
import type { PageEvidence } from "../schemas/audit.js";

const emptyEvidence = {
  headings: [],
  buttons: [],
  links: [],
  visibleTextSample: ""
};

describe("classifyPage", () => {
  it("classifies the root path as homepage", () => {
    expect(classifyPage("https://example.com/", emptyEvidence).pageType).toBe("homepage");
  });

  it("classifies pricing URLs with high confidence", () => {
    const result = classifyPage("https://example.com/pricing", emptyEvidence);
    expect(result.pageType).toBe("pricing");
    expect(result.confidence).toBe("high");
  });

  it("keeps unclear pages unknown", () => {
    const result = classifyPage("https://example.com/abc", emptyEvidence);
    expect(result.pageType).toBe("unknown");
    expect(result.confidence).toBe("low");
  });
});

describe("inferWebsiteType", () => {
  it("infers ecommerce from product/cart evidence", () => {
    const pages = [
      {
        url: "https://example.com/products/a",
        title: "Product",
        pageType: "product_detail",
        text: { visibleTextSample: "Add to cart and shipping details" }
      }
    ] as PageEvidence[];
    expect(inferWebsiteType(pages).websiteType).toBe("ecommerce");
  });
});
