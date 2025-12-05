/**
 * List all Formidable Forms on a WordPress site
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ScriptDefinition, ScriptArgs, ScriptResult, ScriptContext } from "../../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const definition: ScriptDefinition = {
  name: "list-forms",
  description: "List all Formidable Forms on the WordPress site. Returns form ID, key, name, description, and status.",
  parameters: {},
};

interface FormInfo {
  id: string;
  form_key: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
}

/**
 * Load PHP template from the templates directory
 */
function loadPhpTemplate(templateName: string): string {
  const templatePath = join(__dirname, "..", "templates", templateName);
  return readFileSync(templatePath, "utf-8");
}

export async function execute(
  domain: string,
  args: ScriptArgs,
  context: ScriptContext
): Promise<ScriptResult> {
  // Load PHP code from template file
  const phpCode = loadPhpTemplate("list-forms.php");

  // Execute via the runPhpCode helper
  const result = await context.runPhpCode(phpCode);

  if (!result.success) {
    return {
      success: false,
      error: result.error || `PHP execution failed: ${result.stderr}`,
    };
  }

  // Check if Formidable returned an error
  if (result.data && typeof result.data === 'object' && 'error' in result.data) {
    return {
      success: false,
      error: (result.data as { error: string }).error,
    };
  }

  return {
    success: true,
    data: {
      forms: result.data as FormInfo[],
      count: Array.isArray(result.data) ? result.data.length : 0,
    },
  };
}
