#!/usr/bin/env node

/**
 * WordPress MCP Server
 * 
 * A Model Context Protocol (MCP) server for WordPress administration.
 * This server communicates via stdio transport, making it suitable for
 * local integrations like Claude Desktop.
 * 
 * Usage: node dist/index.js <path-to-servers.json>
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getServerDomains,
  getServerInfo,
  searchServers,
  getSshConfig,
  executeSshCommand,
  executeWpCommand,
  executePhpCode,
  initializeConfig,
} from "./lib/ssh.js";
import {
  listSkills,
  readSkill,
  runSkillScript,
} from "./skills/index.js";

// Create the MCP server instance
const server = new McpServer({
  name: "wordpress-mcp",
  version: "1.0.0",
});

// Register a simple "hello world" tool
// server.registerTool(
//   "hello_world",
//   {
//     description: "A simple hello world tool to test the MCP server",
//     inputSchema: {
//       name: z.string().optional().describe("Name to greet (optional)"),
//     },
//   },
//   async ({ name }) => {
//     const greeting = name 
//       ? `Hello, ${name}! Welcome to the WordPress MCP Server.`
//       : "Hello, World! Welcome to the WordPress MCP Server.";
    
//     return {
//       content: [
//         {
//           type: "text",
//           text: greeting,
//         },
//       ],
//     };
//   }
// );

// Search for WordPress servers
server.registerTool(
  "search_servers",
  {
    description: "Search for WordPress servers by name or host. Supports natural language queries like 'inscr' to find servers starting with that string, or wildcards like '*suffix' to find servers ending with a string. Full matches appear first.",
    inputSchema: {
      query: z.string().describe("Search query. Use natural syntax like 'inscr' to find servers starting with that string, or '*suffix' to find servers ending with that string. Case insensitive."),
      limit: z.number().optional().describe("Maximum number of results to return (default: 10)"),
      fields: z.array(z.enum(["host", "name"])).optional().describe("Fields to search in (default: ['host', 'name'], available: 'host', 'name', 'provider')"),
    },
  },
  async ({ query, limit = 10, fields = ["host", "name"] }) => {
    const domains = getServerDomains();
    const allServers = domains.map((domain) => ({
      domain,
      info: getServerInfo(domain),
    }));

    // Perform search
    const matches = searchServers(allServers, query, fields);

    // Limit results
    const limitedMatches = matches.slice(0, limit);

    // Format response
    const results = limitedMatches.map((match) => {
      const server = match.server;
      const matchedField = match.matchedField;
      const matchType = match.matchType;
      return `• ${server.info.name} (${server.domain}) [matched: ${matchedField}, type: ${matchType}]`;
    });

    const totalMatches = matches.length;
    const shownCount = limitedMatches.length;
    const hasMore = totalMatches > shownCount;

    let response = `Found ${totalMatches} matching server${totalMatches !== 1 ? 's' : ''}`;
    if (hasMore) {
      response += ` (showing first ${shownCount})`;
    }
    response += `:\n${results.join('\n')}`;

    if (hasMore) {
      response += `\n\n... and ${totalMatches - shownCount} more results`;
    }

    return {
      content: [
        {
          type: "text",
          text: response,
        },
      ],
    };
  }
);

// Run an arbitrary SSH command on a server
server.registerTool(
  "ssh_run_command",
  {
    description: "Execute a bash command on a WordPress server via SSH. Useful for server inspection tasks like searching the filesystem, checking disk usage, viewing logs, or other administrative tasks.",
    inputSchema: {
      domain: z.string().describe("The domain of the WordPress server"),
      command: z.string().describe("The bash command to execute on the remote Linux server"),
    },
  },
  async ({ domain, command }) => {
    try {
      const result = await executeSshCommand(domain, command);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `✅ Command executed successfully on ${domain}\n\n$ ${command}\n\n${result.stdout}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Command failed with exit code ${result.code}\n\n$ ${command}\n\nStderr:\n${result.stderr}\n\nStdout:\n${result.stdout}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Run PHP code on a WordPress server
server.registerTool(
  "run_php_code",
  {
    description: "Execute PHP code on a WordPress server. Accepts either raw PHP code OR a path to a local PHP file. The code runs via WP-CLI eval-file, so WordPress is fully bootstrapped and all WP functions are available. Use this for complex queries, database operations, or any task requiring PHP logic. Output is automatically parsed as JSON if valid.",
    inputSchema: {
      domain: z.string().describe("The domain of the WordPress server"),
      code: z.string().describe("Either: (1) PHP code to execute (without <?php opening tag), or (2) Absolute path to a local .php file. Auto-detected based on whether it looks like a file path and exists."),
      type: z.enum(["auto", "file", "code"]).optional().describe("How to interpret the 'code' parameter: 'auto' (default) auto-detects, 'file' treats it as a file path, 'code' treats it as raw PHP code."),
      args: z.array(z.string()).optional().describe("CLI arguments to pass to the PHP script. Available in PHP as $args (WP-CLI's 0-indexed array, e.g., $args[0] for the first argument). Useful for parameterizing scripts."),
    },
  },
  async ({ domain, code, type, args }) => {
    try {
      const result = await executePhpCode(domain, code, { type: type || "auto", args: args || [] });
      
      if (result.success) {
        // Format output based on whether we got JSON or raw text
        let output: string;
        if (result.data !== undefined) {
          output = `\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
        } else {
          output = result.stdout || "(no output)";
        }
        
        const sourceNote = result.source === "file" ? " (from file)" : "";
        
        return {
          content: [
            {
              type: "text",
              text: `✅ PHP code executed successfully on ${domain}${sourceNote}\n\n${output}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ PHP execution failed: ${result.error}\n\nStderr:\n${result.stderr}\n\nStdout:\n${result.stdout}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to execute PHP code: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Test SSH connection to a server
server.registerTool(
  "test_ssh_connection",
  {
    description: "Test SSH connection to a WordPress server",
    inputSchema: {
      domain: z.string().describe("The domain of the server to test"),
    },
  },
  async ({ domain }) => {
    try {
      const result = await executeSshCommand(domain, "echo 'SSH connection successful!' && whoami && pwd");
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `✅ SSH connection to ${domain} successful!\n\nOutput:\n${result.stdout}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ SSH command failed with code ${result.code}\n\nStderr:\n${result.stderr}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ SSH connection failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Execute WP-CLI command on a server
server.registerTool(
  "wp_cli",
  {
    description: "Execute a WP-CLI command on a WordPress server",
    inputSchema: {
      domain: z.string().describe("The domain of the WordPress server"),
      command: z.string().describe("The WP-CLI command to execute (without 'wp' prefix)"),
    },
  },
  async ({ domain, command }) => {
    try {
      const result = await executeWpCommand(domain, command);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `✅ WP-CLI command executed successfully on ${domain}\n\n$ wp ${command}\n\n${result.stdout}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ WP-CLI command failed with code ${result.code}\n\n$ wp ${command}\n\nStderr:\n${result.stderr}\n\nStdout:\n${result.stdout}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to execute WP-CLI command: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// List all available skills
server.registerTool(
  "list_skills",
  {
    description: "List all available WordPress skill packages. Skills provide specialized capabilities for WordPress plugins and features. Use this to discover what skills are available before working with specific plugins.",
  },
  async () => {
    try {
      const skills = await listSkills();
      
      if (skills.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No skills are currently available.",
            },
          ],
        };
      }

      const skillsList = skills.map((skill) => 
        `• **${skill.name}** (\`${skill.id}\`)\n  ${skill.description}`
      ).join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Available WordPress Skills:\n\n${skillsList}\n\nUse \`read_skill\` with the skill ID to get detailed instructions and available scripts.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to list skills: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Read a skill's full content
server.registerTool(
  "read_skill",
  {
    description: "Read detailed instructions and available scripts for a specific skill. Call list_skills first to see available skill IDs.",
    inputSchema: {
      skillId: z.string().describe("The skill ID (e.g., 'formidable-forms')"),
    },
  },
  async ({ skillId }) => {
    try {
      const skill = await readSkill(skillId);
      
      // Format scripts section
      let scriptsSection = "";
      if (skill.scripts.length > 0) {
        const scriptsList = skill.scripts.map((script) => {
          const params = Object.entries(script.parameters)
            .map(([name, param]) => {
              const required = param.required ? " (required)" : " (optional)";
              return `    - \`${name}\`${required}: ${param.description}`;
            })
            .join("\n");
          
          return `• **${script.name}**: ${script.description}${params ? `\n${params}` : ""}`;
        }).join("\n\n");
        
        scriptsSection = `\n\n## Available Scripts\n\n${scriptsList}\n\nUse \`run_skill_script\` to execute these scripts.`;
      }

      return {
        content: [
          {
            type: "text",
            text: `${skill.content}${scriptsSection}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to read skill: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Run a skill script
server.registerTool(
  "run_skill_script",
  {
    description: "Execute a script from a skill. Read the skill first using read_skill to see available scripts and their parameters.",
    inputSchema: {
      skillId: z.string().describe("The skill ID (e.g., 'formidable-forms')"),
      script: z.string().describe("The script name to execute (e.g., 'list-forms')"),
      domain: z.string().describe("The target WordPress site domain"),
      args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Script-specific arguments as key-value pairs"),
    },
  },
  async ({ skillId, script, domain, args }) => {
    try {
      const result = await runSkillScript(skillId, script, domain, (args || {}) as Record<string, string | number | boolean>);
      
      if (result.success) {
        const dataOutput = result.data 
          ? JSON.stringify(result.data, null, 2)
          : "Script completed successfully (no data returned)";
        
        return {
          content: [
            {
              type: "text",
              text: `✅ Script \`${skillId}/${script}\` executed successfully on ${domain}\n\n\`\`\`json\n${dataOutput}\n\`\`\``,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Script failed: ${result.error}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to run script: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Main function to start the server
async function main() {
  // Get configuration file path from command line arguments
  const configPath = process.argv[2];
  
  if (!configPath) {
    console.error("Usage: wordpress-mcp <path-to-servers.json>");
    console.error("");
    console.error("Error: Configuration file path is required");
    process.exit(1);
  }

  // Initialize and validate the configuration
  try {
    initializeConfig(configPath);
    console.error(`Loaded configuration from: ${configPath}`);
  } catch (error) {
    console.error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Create the stdio transport for communication
  const transport = new StdioServerTransport();
  
  // Connect the server to the transport
  await server.connect(transport);
  
  // Log to stderr (not stdout, as stdout is used for MCP communication)
  console.error("WordPress MCP Server is running on stdio...");
}

// Start the server
main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
