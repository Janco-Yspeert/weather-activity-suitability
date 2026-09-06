import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("runs on Node 24", () => {
    expect(Number(process.versions.node.split(".")[0])).toBeGreaterThanOrEqual(24);
  });
});
