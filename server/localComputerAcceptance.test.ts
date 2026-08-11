import { describe, it, expect } from "vitest";
import { localComputer } from "./localAutonomousComputer";

describe("Local Autonomous Computer Acceptance Missions", () => {
  it("executes a local mission successfully inside the isolated VM", { timeout: 15000 }, async () => {
    const res = await localComputer.executeMission("mission-test-71", "Research AI programs", {
      provider: "ollama",
      modelName: "llama3",
    });
    expect(res.missionId).toBe("mission-test-71");
    expect(res.status).toBe("completed");
    expect(res.skillsDiscovered).toBeGreaterThanOrEqual(0);
  });
});
