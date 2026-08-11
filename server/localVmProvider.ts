import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

export interface VmConfig {
  missionId: string;
  mode: "temporary" | "persistent";
  cpuLimit?: number;
  memoryMb?: number;
  diskGb?: number;
}

export interface VmExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface VirtualMachineProvider {
  createVm(
    config: VmConfig
  ): Promise<{ vmPath: string; status: string; isolation: string }>;
  initializeVm(
    config: VmConfig
  ): Promise<{ vmPath: string; status: string; isolation: string }>;
  execute(
    missionId: string,
    command: string,
    args?: string[]
  ): Promise<VmExecutionResult>;
  executeInVm(
    missionId: string,
    command: string,
    args?: string[]
  ): Promise<VmExecutionResult>;
  snapshot(missionId: string): Promise<string>;
  snapshotVm(missionId: string): Promise<string>;
  restore(missionId: string, snapshotId: string): Promise<boolean>;
  restoreVm(missionId: string, snapshotId: string): Promise<boolean>;
  destroy(missionId: string): Promise<void>;
  destroyVm(missionId: string): Promise<void>;
}

function assertMissionId(missionId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(missionId))
    throw new Error("Invalid mission id");
}

export class LinuxVirtualMachineProvider implements VirtualMachineProvider {
  private baseDir = path.resolve(
    process.env.ONCLICK_VM_ROOT || "/home/ubuntu/onclick-ai-vms"
  );
  private isolationCommand = "/usr/bin/unshare";

  private vmPath(missionId: string) {
    assertMissionId(missionId);
    return path.join(this.baseDir, `mission-${missionId}`);
  }

  private async readManifest(missionId: string) {
    return JSON.parse(
      await fs.readFile(
        path.join(this.vmPath(missionId), "state", "manifest.json"),
        "utf8"
      )
    );
  }

  async createVm(config: VmConfig) {
    const vmPath = this.vmPath(config.missionId);
    await fs.mkdir(path.join(vmPath, "workspace"), {
      recursive: true,
      mode: 0o700,
    });
    await fs.mkdir(path.join(vmPath, "downloads"), {
      recursive: true,
      mode: 0o700,
    });
    await fs.mkdir(path.join(vmPath, "artifacts"), {
      recursive: true,
      mode: 0o700,
    });
    await fs.mkdir(path.join(vmPath, "logs"), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(vmPath, "browser"), {
      recursive: true,
      mode: 0o700,
    });
    await fs.mkdir(path.join(vmPath, "state"), {
      recursive: true,
      mode: 0o700,
    });

    const manifest = {
      missionId: config.missionId,
      mode: config.mode,
      created: Date.now(),
      status: "running",
      isolation:
        "Linux user, mount, PID, IPC, UTS, and network namespaces via unshare",
      resources: {
        cpuLimit: config.cpuLimit || 2,
        memoryMb: config.memoryMb || 2048,
        diskGb: config.diskGb || 20,
      },
    };
    await fs.writeFile(
      path.join(vmPath, "state", "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
    return { vmPath, status: "running", isolation: manifest.isolation };
  }

  async initializeVm(config: VmConfig) {
    return this.createVm(config);
  }

  async execute(
    missionId: string,
    command: string,
    args: string[] = []
  ): Promise<VmExecutionResult> {
    const vmPath = this.vmPath(missionId);
    const workspacePath = path.join(vmPath, "workspace");
    const manifest = await this.readManifest(missionId);
    if (manifest.status !== "running")
      throw new Error(`VM is not running: ${manifest.status}`);

    try {
      const isolatedArgs = [
        "--user",
        "--map-root-user",
        "--mount",
        "--pid",
        "--fork",
        "--mount-proc",
        "--net",
        "--ipc",
        "--uts",
        "--",
        "/usr/bin/env",
        "-i",
        `PATH=${process.env.PATH || "/usr/local/bin:/usr/bin:/bin"}`,
        `HOME=${workspacePath}`,
        `PWD=${workspacePath}`,
        `ONCLICK_VM_MISSION=${missionId}`,
        command,
        ...args,
      ];
      const { stdout, stderr } = await execFileAsync(
        this.isolationCommand,
        isolatedArgs,
        {
          cwd: workspacePath,
          timeout: 45_000,
          maxBuffer: 15 * 1024 * 1024,
        }
      );
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || "",
        stderr: error.stderr || error.message || "Execution failed",
        exitCode: Number(error.code) || 1,
      };
    }
  }

  async executeInVm(missionId: string, command: string, args: string[] = []) {
    return this.execute(missionId, command, args);
  }

  async snapshot(missionId: string): Promise<string> {
    const vmPath = this.vmPath(missionId);
    const snapshotId = `snapshot-${Date.now()}`;
    const snapshotDir = path.join(vmPath, "state", snapshotId);
    await fs.mkdir(snapshotDir, { recursive: true, mode: 0o700 });
    await execFileAsync(
      "tar",
      [
        "-czf",
        path.join(snapshotDir, "workspace.tar.gz"),
        "-C",
        vmPath,
        "workspace",
      ],
      { timeout: 45_000 }
    );
    await fs.copyFile(
      path.join(vmPath, "state", "manifest.json"),
      path.join(snapshotDir, "manifest.json")
    );
    return snapshotId;
  }

  async snapshotVm(missionId: string) {
    return this.snapshot(missionId);
  }

  async restore(missionId: string, snapshotId: string): Promise<boolean> {
    assertMissionId(missionId);
    if (!/^snapshot-[0-9]+$/.test(snapshotId))
      throw new Error("Invalid snapshot id");
    const vmPath = this.vmPath(missionId);
    const snapshotDir = path.join(vmPath, "state", snapshotId);
    try {
      await fs.rm(path.join(vmPath, "workspace"), {
        recursive: true,
        force: true,
      });
      await fs.mkdir(path.join(vmPath, "workspace"), {
        recursive: true,
        mode: 0o700,
      });
      await execFileAsync(
        "tar",
        ["-xzf", path.join(snapshotDir, "workspace.tar.gz"), "-C", vmPath],
        { timeout: 45_000 }
      );
      await fs.copyFile(
        path.join(snapshotDir, "manifest.json"),
        path.join(vmPath, "state", "manifest.json")
      );
      return true;
    } catch {
      return false;
    }
  }

  async restoreVm(missionId: string, snapshotId: string) {
    return this.restore(missionId, snapshotId);
  }

  async destroy(missionId: string): Promise<void> {
    const vmPath = this.vmPath(missionId);
    try {
      const manifest = await this.readManifest(missionId);
      if (manifest.mode === "persistent") return;
    } catch {
      // If the manifest is gone, removing the isolated VM directory is safe.
    }
    await fs.rm(vmPath, { recursive: true, force: true });
  }

  async destroyVm(missionId: string) {
    return this.destroy(missionId);
  }
}

export class MacVirtualMachineProvider extends LinuxVirtualMachineProvider {}
export class WindowsVirtualMachineProvider extends LinuxVirtualMachineProvider {}

export function getVirtualMachineProvider(): VirtualMachineProvider {
  const platform = os.platform();
  if (platform === "darwin") return new MacVirtualMachineProvider();
  if (platform === "win32") return new WindowsVirtualMachineProvider();
  return new LinuxVirtualMachineProvider();
}

export const vmManager = getVirtualMachineProvider();
