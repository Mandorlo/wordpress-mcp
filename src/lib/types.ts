/**
 * Type definitions for the WordPress MCP server configuration
 */

/** SSH configuration that can be defined at any level */
export interface SshConfig {
  /** SSH port (default: 22) */
  port?: number;
  /** SSH username */
  username?: string;
  /** Path to the private key file */
  privateKeyPath?: string;
  /** Passphrase for the private key (if encrypted) */
  passphrase?: string;
  /** Path to WordPress root directory (can contain {username} and {host} placeholders) */
  wpRootPath?: string;
}

/** Hosting provider configuration */
export interface HostingProvider {
  /** Provider-specific SSH defaults */
  ssh?: SshConfig;
}

/** Server (WordPress site) configuration */
export interface ServerConfig {
  /** Friendly name for the server */
  name: string;
  /** Domain/hostname of the server */
  host: string;
  /** Reference to a hosting provider key */
  hostingProvider?: string;
  /** Server-specific SSH overrides */
  ssh?: SshConfig;
}

/** Root configuration structure (servers.json) */
export interface ServersConfig {
  /** Global SSH defaults */
  ssh?: SshConfig;
  /** Hosting provider configurations */
  hostingProviders?: Record<string, HostingProvider>;
  /** Server configurations keyed by domain */
  servers: Record<string, ServerConfig>;
}

/** Resolved SSH configuration with all required fields */
export interface ResolvedSshConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
  passphrase?: string;
  wpRootPath: string;
}

/** Result of an SSH command execution */
export interface SshCommandResult {
  /** Command exit code */
  code: number;
  /** Standard output */
  stdout: string;
  /** Standard error output */
  stderr: string;
  /** Whether the command succeeded (code === 0) */
  success: boolean;
}
