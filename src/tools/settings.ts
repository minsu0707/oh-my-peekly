import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getSetting, saveSetting } from "../platform/settings.js";

function textResult(payload: Record<string, unknown>, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const getSettingInput = {
  key: z.string().describe("Setting key to look up, e.g. 'issueReviewMode'."),
};

const getSettingOutput = {
  success: z.boolean(),
  found: z.boolean().optional(),
  value: z.unknown().optional(),
  error: z.string().optional(),
};

const saveSettingInput = {
  key: z.string().describe("Setting key to store, e.g. 'issueReviewMode'."),
  value: z.unknown().describe("JSON-serializable value to store for this key."),
};

const saveSettingOutput = {
  success: z.boolean(),
  error: z.string().optional(),
};

export function registerSettingsTools(server: McpServer): void {
  server.registerTool(
    "get_setting",
    {
      title: "Get cached setting",
      description:
        "Look up a previously saved non-secret Peekly setting (e.g. whether to review each issue " +
        "individually). Returns found: false (not an error) when nothing is cached yet — the caller " +
        "decides whether to ask the user and save a value in that case.",
      inputSchema: getSettingInput,
      outputSchema: getSettingOutput,
    },
    async ({ key }) => {
      try {
        const result = getSetting(key);
        return textResult({ success: true, ...result });
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );

  server.registerTool(
    "save_setting",
    {
      title: "Save setting",
      description:
        "Persist a non-secret Peekly setting (e.g. whether to review each issue individually) so future " +
        "runs on this machine don't need to ask again.",
      inputSchema: saveSettingInput,
      outputSchema: saveSettingOutput,
    },
    async ({ key, value }) => {
      try {
        saveSetting(key, value);
        return textResult({ success: true });
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );
}
