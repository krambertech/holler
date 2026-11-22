import { describe, expect, it } from "vitest";
import { productPath } from "./product-paths";

describe("productPath", () => {
  it("fills the params, then the search and the hash", () => {
    expect(productPath("/sign-in")).toBe("/sign-in");
    expect(productPath("/settings", { hash: "billing" })).toBe("/settings#billing");
    expect(productPath("/hollers/$id", { params: { id: "holler 1/2" } })).toBe(
      "/hollers/holler%201%2F2",
    );
    expect(
      productPath("/respond/$id", { params: { id: "h1" }, search: { u: "UA", s: "a-b_c" } }),
    ).toBe("/respond/h1?u=UA&s=a-b_c");
  });
});
