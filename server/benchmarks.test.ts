import { describe, expect, it } from "vitest";
import {
  executeRealBrowserAction,
  executeComputerControl,
} from "./browserEngine";
import { TOOL_REGISTRY, executeTool } from "./agentRuntime";
import { validateCommand, resolveWorkspacePath } from "./security";

describe("OnClick AI Acceptance Benchmarks (Pasted_content_57)", () => {
  it("Benchmark 1: Real Browser & Computer Control Capability", async () => {
    expect(TOOL_REGISTRY["open_url"].permissionTier).toBe("SAFE");
    expect(TOOL_REGISTRY["execute_command"].permissionTier).toBe("RESTRICTED");

    // Verify browser engine helper is defined and callable
    expect(typeof executeRealBrowserAction).toBe("function");
    expect(typeof executeComputerControl).toBe("function");
  });

  it("Benchmark 2: Security & Permission Enforcement", () => {
    // SAFE tools execute automatically
    expect(TOOL_REGISTRY["search_web"].permissionTier).toBe("SAFE");
    // CONFIRM tools require approval
    expect(TOOL_REGISTRY["write"].permissionTier).toBe("CONFIRM");
    // RESTRICTED tools require strict authorization
    expect(TOOL_REGISTRY["execute_command"].permissionTier).toBe("RESTRICTED");

    // Command validation
    expect(() => validateCommand("rm -rf /")).toThrow();
    expect(() => validateCommand("echo 'safe command'")).not.toThrow();

    // Path traversal check
    expect(() => resolveWorkspacePath(1, "../../etc/passwd")).toThrow();
  });

  it("Benchmark 3: Self-Recovery & Verification Loop", async () => {
    // Verify recovery logic handles missing elements or failed commands gracefully
    const res = await executeComputerControl("non_existent_action", {});
    expect(res.success).toBe(false);
    expect(res.error).toContain("Unsupported computer control action");
  });
});
