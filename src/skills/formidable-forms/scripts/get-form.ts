/**
 * Get detailed information about a specific Formidable Form including all fields
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ScriptDefinition, ScriptArgs, ScriptResult, ScriptContext } from "../../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const definition: ScriptDefinition = {
  name: "get-form",
  description: "Get detailed information about a specific form including all its fields, their types, and configuration.",
  parameters: {
    formId: {
      type: "string",
      description: "The form ID (numeric) or form key (alphanumeric)",
      required: true,
    },
  },
};

interface FieldInfo {
  id: string;
  field_key: string;
  name: string;
  description: string;
  type: string;
  required: boolean;
  default_value: string;
  options: Array<{ label: string; value: string }> | null;
  field_order: number;
}

interface FormDetails {
  id: string;
  form_key: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  fields: FieldInfo[];
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
  const formId = args.formId;

  if (!formId) {
    return {
      success: false,
      error: "formId parameter is required",
    };
  }

  // Load PHP template and inject variables
  const template = loadPhpTemplate("get-form.php");
  const escapedFormId = String(formId).replace(/'/g, "\\'");
  const phpCode = `$form_id = '${escapedFormId}';\n` + template;

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
    data: result.data as FormDetails,
  };
}
