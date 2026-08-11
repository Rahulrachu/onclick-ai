import { describe, it, expect } from "vitest";
import { getParityReport } from "./manusParityAudit";

describe("Manus Parity Audit", () => {
  it("returns a comprehensive parity report", () => {
    const report = getParityReport();
    expect(report.platform).toBe("OnClick AI");
    expect(report.metrics.length).toBeGreaterThan(0);
    expect(report.overallParityScore).toBeDefined();
  });
});
