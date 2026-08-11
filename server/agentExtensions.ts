import fs from "fs/promises";
import path from "path";
import { vmManager } from "./localVmProvider";
import { executeRealBrowserAction } from "./browserEngine";

export interface SkillDefinition {
  name: string;
  description: string;
  path: string;
}

export class AgentSkillsEngine {
  private skillsDir = path.resolve("/home/ubuntu/onclick-ai/skills");

  async discoverSkills(): Promise<SkillDefinition[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const skills: SkillDefinition[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          skills.push({
            name: entry.name,
            description: `Extensible workflow skill: ${entry.name}`,
            path: path.join(this.skillsDir, entry.name),
          });
        }
      }
      return skills;
    } catch {
      return [];
    }
  }

  async executeSkill(
    missionId: string,
    skillName: string,
    args: string[] = []
  ): Promise<{ success: boolean; output: string }> {
    const available = await this.discoverSkills();
    if (!available.some(skill => skill.name === skillName))
      throw new Error(`Skill not found: ${skillName}`);
    if (!args[0])
      throw new Error(
        `Skill ${skillName} has no executable command; provide an explicit command and arguments.`
      );
    const res = await vmManager.execute(missionId, args[0], args.slice(1));
    return {
      success: res.exitCode === 0,
      output: res.stdout || res.stderr,
    };
  }
}

export class ParallelResearchEngine {
  async executeParallelSearch(
    missionId: string,
    queries: string[]
  ): Promise<any[]> {
    const results = await Promise.all(
      queries.map(async query => {
        return executeRealBrowserAction(missionId, "search_web", { query });
      })
    );
    return results;
  }
}

export class GithubAgentEngine {
  async runGithubTask(
    missionId: string,
    repoUrl: string,
    commandType: string
  ): Promise<{ success: boolean; output: string }> {
    const res = await vmManager.execute(missionId, "git", [
      "clone",
      repoUrl,
      ".",
    ]);
    return {
      success: res.exitCode === 0,
      output: res.stdout || res.stderr,
    };
  }
}

export const skillsEngine = new AgentSkillsEngine();
export const parallelResearch = new ParallelResearchEngine();
export const githubAgent = new GithubAgentEngine();
