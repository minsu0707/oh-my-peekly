import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Single lazily-created browser session shared by all browser_* tools.
 *
 * MVP scope: one browser / one page. Multi-session management is
 * intentionally out of scope for now (see peekly-mcp-core agent charter) —
 * if concurrent sessions become necessary, that's a follow-up design change,
 * not something to speculatively build here.
 */
let browserInstance: Browser | undefined;
let pageInstance: Page | undefined;
let cleanupRegistered = false;

async function getPage(): Promise<Page> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  if (!pageInstance || pageInstance.isClosed()) {
    const context = await browserInstance.newContext();
    pageInstance = await context.newPage();
  }
  registerCleanup();
  return pageInstance;
}

/**
 * Shared accessor for other tool modules (e.g. the sitemap crawler) that need
 * to reuse the same logged-in browser session/page instead of spinning up a
 * separate browser. Crawling is expected to happen after login, so it must
 * see the same cookies/session as the browser_* tools above.
 */
export { getPage };

async function closeBrowser(): Promise<void> {
  const browser = browserInstance;
  browserInstance = undefined;
  pageInstance = undefined;
  if (browser) {
    try {
      await browser.close();
    } catch {
      // best-effort cleanup on process exit; nothing to report to
    }
  }
}

function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const shutdown = () => {
    void closeBrowser();
  };
  process.once("exit", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

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

const navigateInput = {
  url: z.string().describe("Navigate the shared browser page to this URL."),
};

const navigateOutput = {
  success: z.boolean(),
  url: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  error: z.string().optional(),
};

const clickInput = {
  selector: z.string().describe("CSS selector of the element to click."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Playwright action timeout in milliseconds."),
};

const clickOutput = {
  success: z.boolean(),
  url: z.string().optional(),
  error: z.string().optional(),
};

const typeInput = {
  selector: z.string().describe("CSS selector of the input/textarea element to type into."),
  text: z.string().describe("Text to type into the matched element."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Playwright action timeout in milliseconds."),
};

const typeOutput = {
  success: z.boolean(),
  error: z.string().optional(),
};

const screenshotInput = {
  path: z
    .string()
    .optional()
    .describe(
      "Optional absolute file path to save the PNG screenshot to. If omitted, a file is created under the OS temp directory."
    ),
};

const screenshotOutput = {
  success: z.boolean(),
  path: z.string().optional(),
  error: z.string().optional(),
};

export function registerBrowserTools(server: McpServer): void {
  server.registerTool(
    "browser_navigate",
    {
      title: "Navigate browser",
      description:
        "Navigate the shared browser page to the given URL and report the resulting URL, page title, and HTTP status. Does not judge whether the page is correct — the caller decides that.",
      inputSchema: navigateInput,
      outputSchema: navigateOutput,
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        const response = await page.goto(url, { waitUntil: "load" });
        const payload = {
          success: true,
          url: page.url(),
          title: await page.title(),
          status: response?.status(),
        };
        return textResult(payload);
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );

  server.registerTool(
    "browser_click",
    {
      title: "Click element",
      description:
        "Click the first element matching a CSS selector on the shared browser page and report success/failure plus the current URL after the click.",
      inputSchema: clickInput,
      outputSchema: clickOutput,
    },
    async ({ selector, timeoutMs }) => {
      try {
        const page = await getPage();
        await page.click(selector, timeoutMs ? { timeout: timeoutMs } : undefined);
        return textResult({ success: true, url: page.url() });
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );

  server.registerTool(
    "browser_type",
    {
      title: "Type into element",
      description:
        "Type text into the first element matching a CSS selector on the shared browser page and report success/failure.",
      inputSchema: typeInput,
      outputSchema: typeOutput,
    },
    async ({ selector, text, timeoutMs }) => {
      try {
        const page = await getPage();
        await page.fill(selector, text, timeoutMs ? { timeout: timeoutMs } : undefined);
        return textResult({ success: true });
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );

  server.registerTool(
    "browser_screenshot",
    {
      title: "Screenshot browser page",
      description:
        "Capture a PNG screenshot of the current shared browser page and save it to disk, returning the saved file path.",
      inputSchema: screenshotInput,
      outputSchema: screenshotOutput,
    },
    async ({ path: outputPath }) => {
      try {
        const page = await getPage();
        const targetPath = outputPath ?? (await defaultScreenshotPath());
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await page.screenshot({ path: targetPath, type: "png" });
        return textResult({ success: true, path: targetPath });
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );
}

async function defaultScreenshotPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "peekly-screenshot-"));
  return path.join(dir, `screenshot-${Date.now()}.png`);
}

/** Exposed for tests / graceful shutdown from the server entrypoint. */
export { closeBrowser };
