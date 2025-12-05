
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from "fs";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { Client } from "ssh2";
import { resolve, join } from "path";
import { z } from "zod";
import type {
  ServersConfig,
  ServerConfig,
  SshConfig,
  ResolvedSshConfig,
  SshCommandResult,
} from "./types.js";

// Path to the servers.json config file (set via initializeConfig)
let serversConfigPath: string | null = null;
let cachedConfig: ServersConfig | null = null;

// Zod schema for validating the servers.json structure
const SshConfigSchema = z.object({
  port: z.number().int().positive().optional(),
  username: z.string().optional(),
  privateKeyPath: z.string().optional(),
  passphrase: z.string().optional(),
  wpRootPath: z.string().optional(),
}).strict();

const HostingProviderSchema = z.object({
  ssh: SshConfigSchema.optional(),
}).strict();

const ServerConfigSchema = z.object({
  name: z.string(),
  host: z.string(),
  hostingProvider: z.string().optional(),
  ssh: SshConfigSchema.optional(),
}).strict();

const ServersConfigSchema = z.object({
  ssh: SshConfigSchema.optional(),
  hostingProviders: z.record(z.string(), HostingProviderSchema).optional(),
  servers: z.record(z.string(), ServerConfigSchema),
}).strict();

/**
 * Initialize the config module with the path to servers.json
 * Validates the JSON structure on load
 * @throws Error if the file doesn't exist or has invalid structure
 */
export function initializeConfig(configPath: string): void {
  const resolvedPath = resolve(configPath);
  
  if (!existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: ${resolvedPath}`);
  }

  let configContent: string;
  try {
    configContent = readFileSync(resolvedPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Invalid JSON in configuration file: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Validate with Zod
  const validationResult = ServersConfigSchema.safeParse(parsedJson);
  if (!validationResult.success) {
    const issues = validationResult.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    ).join("\n");
    throw new Error(`Invalid configuration file structure:\n${issues}`);
  }

  serversConfigPath = resolvedPath;
  cachedConfig = validationResult.data as ServersConfig;
}

/**
 * Load and parse the servers configuration file
 */
function loadServersConfig(): ServersConfig {
  if (!cachedConfig) {
    throw new Error("Configuration not initialized. Call initializeConfig() first.");
  }
  return cachedConfig;
}

/**
 * Replace template variables in a string
 * Supports: {username}, {host}
 */
function resolveTemplateVars(
  template: string,
  vars: { username: string; host: string }
): string {
  return template
    .replace(/\{username\}/g, vars.username)
    .replace(/\{host\}/g, vars.host);
}

/**
 * Merge SSH configs with proper precedence:
 * server > hostingProvider > global
 */
function mergeSshConfigs(...configs: (SshConfig | undefined)[]): SshConfig {
  const result: SshConfig = {};
  for (const config of configs) {
    if (config) {
      Object.assign(result, config);
    }
  }
  return result;
}

/**
 * Get the resolved SSH configuration for a domain
 * Merges global, hosting provider, and server-specific configs
 */
export function getSshConfig(domain: string): ResolvedSshConfig {
  const config = loadServersConfig();
  const server = config.servers[domain];

  if (!server) {
    throw new Error(`Server not found: ${domain}`);
  }

  // Get hosting provider config if specified
  const providerConfig = server.hostingProvider
    ? config.hostingProviders?.[server.hostingProvider]
    : undefined;

  // Merge configs with precedence: server > provider > global
  const merged = mergeSshConfigs(
    config.ssh,
    providerConfig?.ssh,
    server.ssh
  );

  // Validate required fields
  if (!merged.username) {
    throw new Error(`SSH username not configured for ${domain}`);
  }
  if (!merged.privateKeyPath) {
    throw new Error(`SSH private key path not configured for ${domain}`);
  }

  const resolvedConfig: ResolvedSshConfig = {
    host: server.host,
    port: merged.port ?? 22,
    username: merged.username,
    privateKeyPath: merged.privateKeyPath,
    passphrase: merged.passphrase,
    wpRootPath: merged.wpRootPath
      ? resolveTemplateVars(merged.wpRootPath, {
          username: merged.username,
          host: server.host,
        })
      : `/home/${merged.username}/public_html`,
  };

  return resolvedConfig;
}

/**
 * Get list of all configured server domains
 */
export function getServerDomains(): string[] {
  const config = loadServersConfig();
  return Object.keys(config.servers);
}

/**
 * Get server info by domain
 */
export function getServerInfo(domain: string): ServerConfig {
  const config = loadServersConfig();
  const server = config.servers[domain];
  if (!server) {
    throw new Error(`Server not found: ${domain}`);
  }
  return server;
}

/**
 * Search result for server search
 */
export interface ServerSearchResult {
  server: { domain: string; info: ServerConfig };
  matchedField: string;
  matchType: 'exact' | 'prefix' | 'suffix';
  score: number; // For sorting (higher = better match)
}

/**
 * Search servers by query
 */
export function searchServers(
  servers: Array<{ domain: string; info: ServerConfig }>,
  query: string,
  fields: ('host' | 'name')[] = ['host', 'name']
): ServerSearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  const results: ServerSearchResult[] = [];

  // Determine search mode
  let searchMode: 'prefix' | 'suffix' = 'prefix';
  let searchQuery = normalizedQuery;

  if (normalizedQuery.startsWith('*') || normalizedQuery.startsWith('%')) {
    searchMode = 'suffix';
    searchQuery = normalizedQuery.substring(1);
  }

  for (const server of servers) {
    for (const field of fields) {
      const fieldValue = field === 'host' ? server.domain : server.info.name;
      const normalizedField = fieldValue.toLowerCase();

      let matchType: 'exact' | 'prefix' | 'suffix' | null = null;
      let score = 0;

      if (searchMode === 'prefix') {
        if (normalizedField === searchQuery) {
          matchType = 'exact';
          score = 100;
        } else if (normalizedField.startsWith(searchQuery)) {
          matchType = 'prefix';
          score = 50;
        }
      } else { // suffix
        if (normalizedField === searchQuery) {
          matchType = 'exact';
          score = 100;
        } else if (normalizedField.endsWith(searchQuery)) {
          matchType = 'suffix';
          score = 50;
        }
      }

      if (matchType) {
        results.push({
          server,
          matchedField: field,
          matchType,
          score,
        });
      }
    }
  }

  // Sort by score (descending), then by field priority (host first), then alphabetically
  results.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.matchedField !== b.matchedField) {
      return a.matchedField === 'host' ? -1 : 1; // host matches first
    }
    return a.server.domain.localeCompare(b.server.domain);
  });

  return results;
}

/**
 * Execute a command via SSH on a remote server
 */
export async function executeSshCommand(
  domain: string,
  command: string
): Promise<SshCommandResult> {
  const sshConfig = getSshConfig(domain);
  const privateKey = readFileSync(sshConfig.privateKeyPath, "utf-8");

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("close", (code: number) => {
          conn.end();
          resolve({
            code,
            stdout,
            stderr,
            success: code === 0,
          });
        });

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      reject(err);
    });

    conn.connect({
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      privateKey,
      passphrase: sshConfig.passphrase,
    });
  });
}

/**
 * Execute a WP-CLI command on a remote WordPress server
 */
export async function executeWpCommand(
  domain: string,
  wpCommand: string
): Promise<SshCommandResult> {
  const sshConfig = getSshConfig(domain);
  // Build the full command with cd to WordPress root and wp-cli execution
  const fullCommand = `cd ${sshConfig.wpRootPath} && wp ${wpCommand}`;
  return executeSshCommand(domain, fullCommand);
}

/**
 * Result from running PHP code
 */
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
  /** Source of the PHP code (for debugging) */
  source?: "file" | "code";
}

/**
 * Options for executePhpCode
 */
export interface PhpCodeOptions {
  /** 
   * Whether the input is a local file path or raw PHP code
   * - 'auto': Auto-detect based on whether input looks like a file path and exists (default)
   * - 'file': Treat input as a local file path
   * - 'code': Treat input as raw PHP code
   */
  type?: "auto" | "file" | "code";
  /**
   * CLI arguments to pass to the PHP script.
   * These will be available in PHP as $args (WP-CLI's variable, 0-indexed).
   * For example, $args[0] is the first argument, $args[1] is the second, etc.
   * Arguments are properly escaped for the shell.
   */
  args?: string[];
}

/**
 * Shell-quote a string for safe use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 * This is POSIX-compatible and works across bash, sh, zsh, etc.
 */
function shellQuote(arg: string): string {
  // If the argument is empty, return quoted empty string
  if (arg === "") {
    return "''";
  }
  // If the argument contains only safe characters, no quoting needed
  if (/^[a-zA-Z0-9@%+=:,./_-]+$/.test(arg)) {
    return arg;
  }
  // Otherwise, wrap in single quotes and escape any single quotes inside
  // The technique: end the single-quoted string, add an escaped single quote,
  // then start a new single-quoted string: 'foo'\''bar' => foo'bar
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

// Cache for PHP availability check (null = not checked yet)
let phpAvailable: boolean | null = null;

/**
 * Check if PHP is available locally for syntax checking
 */
function isPhpAvailable(): boolean {
  if (phpAvailable !== null) {
    return phpAvailable;
  }
  
  try {
    execSync("php -v", { stdio: "pipe" });
    phpAvailable = true;
  } catch {
    phpAvailable = false;
  }
  
  return phpAvailable;
}

/**
 * Result from PHP syntax check
 */
interface PhpSyntaxCheckResult {
  valid: boolean;
  error?: string;
}

/**
 * Check PHP code syntax locally using `php -l`
 * Returns { valid: true } if syntax is correct or PHP is not available locally
 * Returns { valid: false, error: "..." } if there's a syntax error
 */
function checkPhpSyntax(phpCode: string): PhpSyntaxCheckResult {
  if (!isPhpAvailable()) {
    // PHP not available locally, skip syntax check
    return { valid: true };
  }
  
  // Create a temporary file with the PHP code
  let tempDir: string;
  let tempFile: string;
  
  try {
    tempDir = mkdtempSync(join(tmpdir(), "wp-mcp-"));
    tempFile = join(tempDir, "syntax-check.php");
    
    // Write the PHP code with <?php tag
    writeFileSync(tempFile, `<?php\n${phpCode}`);
    
    try {
      // Run php -l to check syntax
      execSync(`php -l "${tempFile}"`, { stdio: "pipe" });
      return { valid: true };
    } catch (error: unknown) {
      // Extract the error message from execSync error
      const execError = error as { stderr?: Buffer; stdout?: Buffer };
      const stderr = execError.stderr?.toString() || "";
      const stdout = execError.stdout?.toString() || "";
      const output = stderr || stdout;
      
      if (output) {
        // Parse PHP's error output to extract the meaningful part
        // Typical format: "PHP Parse error: syntax error, ... in /path/to/file on line X"
        const match = output.match(/^(.*?)\s+in\s+.*?syntax-check\.php\s+on\s+line\s+(\d+)/im);
        if (match) {
          // Adjust line number to account for the <?php we added
          const lineNum = parseInt(match[2], 10) - 1;
          return { 
            valid: false, 
            error: `${match[1].trim()} on line ${lineNum}` 
          };
        }
        
        // Fallback: return the raw error
        return { valid: false, error: output.trim() };
      }
      return { valid: false, error: "PHP syntax error" };
    }
  } catch {
    // If we can't create temp file or something else fails, skip the check
    return { valid: true };
  } finally {
    // Clean up temp file and directory
    try {
      if (tempFile!) unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    try {
      if (tempDir!) {
        // rmdirSync only works on empty directories, which is fine since we deleted the file
        rmdirSync(tempDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Execute PHP code on a remote WordPress server
 * 
 * This function:
 * 1. Reads PHP code from a local file OR accepts raw code
 * 2. Strips <?php and ?> tags if present (supports both with and without)
 * 3. Checks PHP syntax locally if PHP is available
 * 4. Creates a temporary PHP file on the remote server
 * 5. Executes it via `wp eval-file` (WordPress is bootstrapped)
 * 6. Cleans up the temporary file
 * 7. Returns the result, attempting to parse JSON output
 * 
 * @param domain - The WordPress server domain
 * @param phpCodeOrPath - PHP code to execute (with or without <?php tag) OR path to a local PHP file
 * @param options - Options for execution
 * @returns Result with parsed JSON data if output is valid JSON
 */
export async function executePhpCode(
  domain: string,
  phpCodeOrPath: string,
  options: PhpCodeOptions = {}
): Promise<PhpCodeResult> {
  const { type = "auto", args = [] } = options;
  
  // Validate args: limit count and total size to prevent issues
  const MAX_ARGS = 50;
  const MAX_TOTAL_LENGTH = 32768; // 32KB
  
  if (args.length > MAX_ARGS) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      code: -1,
      error: `Too many arguments: ${args.length} provided, maximum is ${MAX_ARGS}`,
      source: "code",
    };
  }
  
  const totalArgsLength = args.reduce((sum, arg) => sum + arg.length, 0);
  if (totalArgsLength > MAX_TOTAL_LENGTH) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      code: -1,
      error: `Arguments too long: ${totalArgsLength} bytes, maximum is ${MAX_TOTAL_LENGTH} bytes`,
      source: "code",
    };
  }
  
  // Escape all arguments for shell
  const escapedArgs = args.map(shellQuote).join(" ");
  
  let phpCode: string;
  let source: "file" | "code";
  
  // Determine if input is a file path or raw code
  if (type === "file" || (type === "auto" && looksLikeFilePath(phpCodeOrPath) && existsSync(phpCodeOrPath))) {
    // It's a file path - read the contents
    if (!existsSync(phpCodeOrPath)) {
      return {
        success: false,
        stdout: "",
        stderr: "",
        code: -1,
        error: `PHP file not found: ${phpCodeOrPath}`,
        source: "file",
      };
    }
    
    try {
      phpCode = readFileSync(phpCodeOrPath, "utf-8");
      source = "file";
      
      // Strip <?php opening tag if present (we add it ourselves)
      phpCode = phpCode.replace(/^<\?php\s*/i, "");
      // Also strip closing ?> tag if present
      phpCode = phpCode.replace(/\?>\s*$/i, "");
    } catch (error) {
      return {
        success: false,
        stdout: "",
        stderr: "",
        code: -1,
        error: `Failed to read PHP file: ${error instanceof Error ? error.message : String(error)}`,
        source: "file",
      };
    }
  } else {
    // It's raw PHP code
    phpCode = phpCodeOrPath;
    source = "code";
    
    // Strip <?php opening tag if present (we add it ourselves)
    phpCode = phpCode.replace(/^<\?php\s*/i, "");
    // Also strip closing ?> tag if present
    phpCode = phpCode.replace(/\?>\s*$/i, "");
  }
  
  // Check PHP syntax locally before sending to remote server
  const syntaxCheck = checkPhpSyntax(phpCode);
  if (!syntaxCheck.valid) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      code: -1,
      error: `PHP syntax error: ${syntaxCheck.error}`,
      source,
    };
  }
  
  const sshConfig = getSshConfig(domain);
  
  // Generate a unique temp file path
  const tempFileName = `wp-mcp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.php`;
  const tempFilePath = `/tmp/${tempFileName}`;
  
  // Escape the PHP code for shell
  // We use heredoc syntax to avoid escaping issues
  const heredocMarker = "WPMCP_PHP_CODE";
  
  // Build the command:
  // 1. Create temp file with PHP code using heredoc
  // 2. Execute via wp eval-file (with optional arguments)
  // 3. Capture exit code
  // 4. Clean up temp file
  // 5. Exit with captured code
  const argsString = escapedArgs ? ` ${escapedArgs}` : "";
  const command = `cd ${sshConfig.wpRootPath} && cat > ${tempFilePath} << '${heredocMarker}'
<?php
${phpCode}
${heredocMarker}
wp eval-file ${tempFilePath}${argsString}
WP_EXIT_CODE=$?
rm -f ${tempFilePath}
exit $WP_EXIT_CODE`;

  try {
    const result = await executeSshCommand(domain, command);
    
    // Try to parse stdout as JSON
    let data: unknown = undefined;
    if (result.stdout.trim()) {
      try {
        data = JSON.parse(result.stdout.trim());
      } catch {
        // Output is not JSON, that's okay
      }
    }
    
    if (!result.success) {
      return {
        success: false,
        data,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        error: result.stderr || `Command failed with exit code ${result.code}`,
        source,
      };
    }
    
    return {
      success: true,
      data,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
      source,
    };
  } catch (error) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      code: -1,
      error: `Failed to execute PHP code: ${error instanceof Error ? error.message : String(error)}`,
      source,
    };
  }
}

/**
 * Check if a string looks like a file path
 */
function looksLikeFilePath(str: string): boolean {
  // Check for common file path patterns
  // - Starts with / (Unix absolute)
  // - Starts with ./ or ../ (relative)
  // - Starts with C:\ or similar (Windows absolute)
  // - Ends with .php
  const trimmed = str.trim();
  
  if (trimmed.endsWith(".php")) return true;
  if (trimmed.startsWith("/")) return true;
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) return true;
  if (/^[A-Za-z]:[\\\/]/.test(trimmed)) return true;
  
  return false;
}