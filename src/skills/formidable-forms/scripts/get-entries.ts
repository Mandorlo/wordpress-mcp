/**
 * Get entries/submissions for a Formidable Form
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ScriptDefinition, ScriptArgs, ScriptResult, ScriptContext } from "../../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const definition: ScriptDefinition = {
  name: "get-entries",
  description: "Retrieve form entries/submissions for a specific form. Supports pagination.",
  parameters: {
    formId: {
      type: "string",
      description: "The form ID (numeric)",
      required: true,
    },
    limit: {
      type: "number",
      description: "Number of entries to retrieve (default: 25)",
      required: false,
      default: 25,
    },
    page: {
      type: "number",
      description: "Page number for pagination (default: 1)",
      required: false,
      default: 1,
    },
  },
};

interface EntryMeta {
  [fieldId: string]: string | number | boolean | null;
}

interface EntryInfo {
  id: string;
  item_key: string;
  form_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  ip: string;
  meta: EntryMeta;
}

interface EntriesResult {
  entries: EntryInfo[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function execute(
  domain: string,
  args: ScriptArgs,
  context: ScriptContext
): Promise<ScriptResult> {
  const formId = args.formId;
  const limit = typeof args.limit === "number" ? args.limit : 25;
  const page = typeof args.page === "number" ? args.page : 1;

  if (!formId) {
    return {
      success: false,
      error: "formId parameter is required",
    };
  }

  // Load PHP template and inject variables
  const templatePath = join(__dirname, "..", "templates", "get-entries.php");
  const template = readFileSync(templatePath, "utf-8");
  const escapedFormId = String(formId).replace(/'/g, "\\'");
  const phpCode = `$form_id = intval('${escapedFormId}'); $limit = ${limit}; $page = ${page};\n` + template;

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
    data: result.data as EntriesResult,
  };
}
