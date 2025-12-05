/**
 * Type definitions for the Skills system
 */

/** YAML frontmatter from SKILL.md */
export interface SkillMetadata {
  /** Unique identifier (lowercase, hyphens, max 64 chars) */
  name: string;
  /** Description for AI agent discovery (max 1024 chars) */
  description: string;
}

/** Script parameter definition */
export interface ScriptParameter {
  /** Parameter type */
  type: "string" | "number" | "boolean";
  /** Human-readable description */
  description: string;
  /** Whether the parameter is required */
  required?: boolean;
  /** Default value if not provided */
  default?: string | number | boolean;
}

/** Script definition exposed to AI agent */
export interface ScriptDefinition {
  /** Script name (filename without extension) */
  name: string;
  /** Human-readable description of what the script does */
  description: string;
  /** Parameter definitions */
  parameters: Record<string, ScriptParameter>;
}

/** Full skill data returned by read_skill */
export interface SkillContent {
  /** Skill metadata from frontmatter */
  metadata: SkillMetadata;
  /** Full SKILL.md content (without frontmatter) */
  content: string;
  /** Available scripts in this skill */
  scripts: ScriptDefinition[];
}

/** Lightweight skill info for list_skills */
export interface SkillInfo {
  /** Skill ID (directory name) */
  id: string;
  /** Skill name from metadata */
  name: string;
  /** Skill description from metadata */
  description: string;
}

/** Arguments passed to a skill script */
export interface ScriptArgs {
  [key: string]: string | number | boolean | undefined;
}

/** Result from running a skill script */
export interface ScriptResult {
  /** Whether the script succeeded */
  success: boolean;
  /** Result data (JSON-serializable) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}

/** Script module interface - what each script must export */
export interface ScriptModule {
  /** Script metadata */
  definition: ScriptDefinition;
  /** Execute the script */
  execute: (
    domain: string,
    args: ScriptArgs,
    context: ScriptContext
  ) => Promise<ScriptResult>;
}

/** Context passed to script execution */
export interface ScriptContext {
  /** Execute a WP-CLI command on the target server */
  wpCli: (command: string) => Promise<WpCliResult>;
  /** Execute a raw SSH command on the target server */
  ssh: (command: string) => Promise<SshResult>;
  /** 
   * Execute PHP code on the target server via wp eval-file.
   * Can accept either raw PHP code or a local file path.
   * @param phpCodeOrPath - Raw PHP code (without <?php tag) or path to a local .php file
   * @param options - Options to control interpretation (auto-detects by default)
   */
  runPhpCode: (phpCodeOrPath: string, options?: PhpCodeOptions) => Promise<PhpCodeResult>;
}

/** Result from WP-CLI command */
export interface WpCliResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/** Result from SSH command */
export interface SshResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/** Result from PHP code execution */
export interface PhpCodeResult {
  /** Whether the execution succeeded */
  success: boolean;
  /** Parsed JSON data if output was valid JSON */
  data?: unknown;
  /** Raw stdout output */
  stdout: string;
  /** Raw stderr output */
  stderr: string;
  /** Exit code */
  code: number;
  /** Error message if failed */
  error?: string;
  /** Source of the PHP code */
  source?: "file" | "code";
}

/** Options for running PHP code */
export interface PhpCodeOptions {
  /** 
   * Whether the input is a local file path or raw PHP code
   * - 'auto': Auto-detect based on whether input looks like a file path and exists (default)
   * - 'file': Treat input as a local file path
   * - 'code': Treat input as raw PHP code
   */
  type?: "auto" | "file" | "code";
}
