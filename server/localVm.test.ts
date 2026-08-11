import { describe, it, expect } from "vitest";
import { vmManager } from "./localVmProvider";

describe("Local Linux VM & Sandbox Manager", () => {
  it("initializes an isolated vm workspace", async () => {
    const missionId = `test-mission-${Date.now()}`;
    const res = await vmManager.initializeVm({ missionId, mode: "temporary", cpuLimit: 2, memoryMb: 1024 });
    expect(res.status).toBe("running");
    expect(res.vmPath).toBeDefined();

    const execRes = await vmManager.executeInVm(missionId, "node", ["-e", "console.log('VM OK')"]);
    expect(execRes.exitCode).toBe(0);
    expect(execRes.stdout.trim()).toBe("VM OK");

    const snapId = await vmManager.snapshotVm(missionId);
    expect(snapId).toBeDefined();

    const restored = await vmManager.restoreVm(missionId, snapId);
    expect(restored).toBe(true);

    await vmManager.destroyVm(missionId);
  });
});
