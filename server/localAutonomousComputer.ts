import { vmManager } from "./localVmProvider";
import { skillsEngine, parallelResearch } from "./agentExtensions";

export interface LocalModelConfig {
  provider: "ollama" | "openai" | "anthropic" | "gemini";
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
}

export class LocalAutonomousComputerSystem {
  async executeMission(
    missionId: string,
    prompt: string,
    modelConfig: LocalModelConfig
  ) {
    void modelConfig;
    const vm = await vmManager.createVm({ missionId, mode: "temporary" });
    const skills = await skillsEngine.discoverSkills();
    const researchResults = await parallelResearch.executeParallelSearch(
      missionId,
      [prompt]
    );
    const successful =
      researchResults.length > 0 &&
      researchResults.every((result: any) => result?.success === true);

    return {
      missionId,
      vmPath: vm.vmPath,
      skillsDiscovered: skills.length,
      researchResults,
      status: successful ? "completed" : "failed",
      verified: successful,
    };
  }
}

export const localComputer = new LocalAutonomousComputerSystem();
