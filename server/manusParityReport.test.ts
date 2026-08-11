import { describe, it, expect } from "vitest";
import { MANUS_PARITY_REPORT } from "./manusParityReport";

describe("Manus Parity Report", () => {
  it("contains core capabilities and distinguishes local execution from proprietary cloud infrastructure", () => {
    expect(MANUS_PARITY_REPORT.length).toBeGreaterThanOrEqual(6);
    const cloudItem = MANUS_PARITY_REPORT.find(item => item.capability.includes("Cloud"));
    expect(cloudItem).toBeDefined();
    expect(cloudItem?.onclickAiStatus).toBe("External Infrastructure Required");

    const coreItem = MANUS_PARITY_REPORT.find(item => item.capability.includes("Autonomous Loop"));
    expect(coreItem?.onclickAiStatus).toBe("Fully Implemented");
  });
});
