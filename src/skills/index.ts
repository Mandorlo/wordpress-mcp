/**
 * Skills discovery and loading system
 * 
 * This module handles:
 * - Discovering skills from the src/skills directory
 * - Parsing SKILL.md files with YAML frontmatter
 * - Loading script definitions from skill directories
 * - Executing skill scripts
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve, join } from "path";
import type {
  SkillMetadata,
  SkillInfo,
  SkillContent,
  ScriptDefinition,
  ScriptArgs,
  ScriptResult,
  ScriptModule,
  ScriptContext,
} from "./types.js";
import { executeSshCommand, executeWpCommand, executePhpCode } from "../lib/ssh.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skills directory is the same directory as this file
const SKILLS_DIR = __dirname;

/**
 * Parse YAML frontmatter from SKILL.md content
 * Expects format:
 * ---
 * name: skill-name
 * description: Skill description
 * ---
 * 
 * # Markdown content...
 */
function parseSkillMd(content: string): { metadata: SkillMetadata; body: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error("SKILL.md must have YAML frontmatter");
  }

  const [, yamlContent, body] = frontmatterMatch;
  
  // Simple YAML parsing for name and description
  const metadata: SkillMetadata = {
    name: "",
    description: "",
  };

  for (const line of yamlContent.split(/\r?\n/)) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) {
      metadata.name = nameMatch[1].trim();
    }
    
    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) {
      metadata.description = descMatch[1].trim();
    }
  }

  if (!metadata.name) {
    throw new Error("SKILL.md frontmatter must have 'name' field");
  }
  if (!metadata.description) {
    throw new Error("SKILL.md frontmatter must have 'description' field");
  }

  return { metadata, body: body.trim() };
}

/**
 * Check if a directory is a valid skill (has SKILL.md)
 */
function isSkillDirectory(dirPath: string): boolean {
  const skillMdPath = join(dirPath, "SKILL.md");
  return existsSync(skillMdPath);
}

/**
 * Get list of all skill directories
 */
function getSkillDirectories(): string[] {
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => isSkillDirectory(join(SKILLS_DIR, name)));
}

/**
 * Load script definitions from a skill's scripts directory
 */
async function loadScriptDefinitions(skillId: string): Promise<ScriptDefinition[]> {
  const scriptsDir = join(SKILLS_DIR, skillId, "scripts");
  
  if (!existsSync(scriptsDir)) {
    return [];
  }

  const scriptFiles = readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);

  const definitions: ScriptDefinition[] = [];

  for (const scriptFile of scriptFiles) {
    try {
      const scriptPath = join(scriptsDir, scriptFile);
      // Use pathToFileURL for cross-platform dynamic imports
      const module = await import(pathToFileURL(scriptPath).href) as ScriptModule;
      
      if (module.definition) {
        definitions.push(module.definition);
      }
    } catch (error) {
      // Skip scripts that can't be loaded
      console.error(`Failed to load script ${scriptFile}:`, error);
    }
  }

  return definitions;
}

/**
 * List all available skills with their metadata
 */
export async function listSkills(): Promise<SkillInfo[]> {
  const skillDirs = getSkillDirectories();
  const skills: SkillInfo[] = [];

  for (const skillId of skillDirs) {
    try {
      const skillMdPath = join(SKILLS_DIR, skillId, "SKILL.md");
      const content = readFileSync(skillMdPath, "utf-8");
      const { metadata } = parseSkillMd(content);
      
      skills.push({
        id: skillId,
        name: metadata.name,
        description: metadata.description,
      });
    } catch (error) {
      // Skip skills that can't be parsed
      console.error(`Failed to load skill ${skillId}:`, error);
    }
  }

  return skills;
}

/**
 * Read a skill's full content including SKILL.md and available scripts
 */
export async function readSkill(skillId: string): Promise<SkillContent> {
  const skillDir = join(SKILLS_DIR, skillId);
  
  if (!existsSync(skillDir)) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  const skillMdPath = join(skillDir, "SKILL.md");
  
  if (!existsSync(skillMdPath)) {
    throw new Error(`Skill ${skillId} is missing SKILL.md`);
  }

  const content = readFileSync(skillMdPath, "utf-8");
  const { metadata, body } = parseSkillMd(content);
  const scripts = await loadScriptDefinitions(skillId);

  return {
    metadata,
    content: body,
    scripts,
  };
}

/**
 * Execute a skill script
 */
export async function runSkillScript(
  skillId: string,
  scriptName: string,
  domain: string,
  args: ScriptArgs
): Promise<ScriptResult> {
  const scriptsDir = join(SKILLS_DIR, skillId, "scripts");
  const scriptPath = join(scriptsDir, `${scriptName}.js`);

  console.error(`[DEBUG] SKILLS_DIR: ${SKILLS_DIR}`);
  console.error(`[DEBUG] scriptPath: ${scriptPath}`);
  console.error(`[DEBUG] exists: ${existsSync(scriptPath)}`);

  if (!existsSync(scriptPath)) {
    return {
      success: false,
      error: `Script not found: ${skillId}/${scriptName} (looked in: ${scriptPath})`,
    };
  }

  try {
    // Use pathToFileURL for cross-platform dynamic imports
    const module = await import(pathToFileURL(scriptPath).href) as ScriptModule;
    
    if (!module.execute) {
      return {
        success: false,
        error: `Script ${scriptName} does not export an execute function`,
      };
    }

    // Create execution context with helper functions
    const context: ScriptContext = {
      wpCli: async (command: string) => {
        const result = await executeWpCommand(domain, command);
        return {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code,
        };
      },
      ssh: async (command: string) => {
        const result = await executeSshCommand(domain, command);
        return {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code,
        };
      },
      runPhpCode: async (phpCode: string) => {
        return await executePhpCode(domain, phpCode);
      },
    };

    return await module.execute(domain, args, context);
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute script: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
