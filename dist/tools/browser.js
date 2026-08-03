import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { z } from "zod";
/**
 * One shared browser + one shared context (so all sessions/tabs see the
 * same cookies — logging in once carries over to every tab), but multiple
 * pages ("sessions") within that context, keyed by sessionId. This lets
 * the caller test several menus/screens concurrently in separate tabs
 * instead of one screen at a time in a single page, while still sharing
 * the logged-in state. `DEFAULT_SESSION_ID` preserves the pre-multi-session
 * single-page behavior for callers that never pass a sessionId.
 */
const DEFAULT_SESSION_ID = "default";
let browserInstance;
let contextInstance;
const pages = new Map();
let cleanupRegistered = false;
async function getPage(sessionId = DEFAULT_SESSION_ID) {
    if (!browserInstance) {
        browserInstance = await chromium.launch({ headless: true });
    }
    if (!contextInstance) {
        contextInstance = await browserInstance.newContext();
    }
    let page = pages.get(sessionId);
    if (!page || page.isClosed()) {
        page = await contextInstance.newPage();
        pages.set(sessionId, page);
    }
    registerCleanup();
    return page;
}
/**
 * Shared accessor for other tool modules (e.g. the sitemap crawler) that need
 * to reuse the same logged-in browser session/page instead of spinning up a
 * separate browser. Crawling is expected to happen after login, so it must
 * see the same cookies/session as the browser_* tools above.
 */
export { getPage, DEFAULT_SESSION_ID };
async function closeBrowser() {
    const browser = browserInstance;
    browserInstance = undefined;
    contextInstance = undefined;
    pages.clear();
    if (browser) {
        try {
            await browser.close();
        }
        catch {
            // best-effort cleanup on process exit; nothing to report to
        }
    }
}
function registerCleanup() {
    if (cleanupRegistered)
        return;
    cleanupRegistered = true;
    const shutdown = () => {
        void closeBrowser();
    };
    process.once("exit", shutdown);
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}
function textResult(payload, isError = false) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError,
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
const sessionIdField = z
    .string()
    .optional()
    .describe(`Which browser tab/session to act on. Omit to use the default single-tab session (${DEFAULT_SESSION_ID}) — ` +
    "existing single-session callers don't need to change. Use browser_new_session to open additional " +
    "tabs (they share login/cookies with the default tab) for testing several screens concurrently.");
const navigateInput = {
    url: z.string().describe("Navigate the shared browser page to this URL."),
    sessionId: sessionIdField,
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
    sessionId: sessionIdField,
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
    sessionId: sessionIdField,
};
const typeOutput = {
    success: z.boolean(),
    error: z.string().optional(),
};
const screenshotInput = {
    path: z
        .string()
        .optional()
        .describe("Optional absolute file path to save the PNG screenshot to. If omitted, a file is created under the OS temp directory."),
    sessionId: sessionIdField,
};
const screenshotOutput = {
    success: z.boolean(),
    path: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    error: z.string().optional(),
};
const boundingBoxInput = {
    selector: z.string().describe("CSS selector of the element to measure."),
    sessionId: sessionIdField,
};
const boundingBoxOutput = {
    success: z.boolean(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    viewportWidth: z.number().optional(),
    viewportHeight: z.number().optional(),
    error: z.string().optional(),
};
const newSessionInput = {
    sessionId: z
        .string()
        .optional()
        .describe("Identifier to give the new tab/session. If omitted, one is auto-generated and returned."),
};
const newSessionOutput = {
    success: z.boolean(),
    sessionId: z.string().optional(),
    error: z.string().optional(),
};
const closeSessionInput = {
    sessionId: z.string().describe("Identifier of the tab/session to close (from browser_new_session)."),
};
const closeSessionOutput = {
    success: z.boolean(),
    error: z.string().optional(),
};
export function registerBrowserTools(server) {
    server.registerTool("browser_navigate", {
        title: "Navigate browser",
        description: "Navigate the shared browser page to the given URL and report the resulting URL, page title, and HTTP status. Does not judge whether the page is correct — the caller decides that.",
        inputSchema: navigateInput,
        outputSchema: navigateOutput,
    }, async ({ url, sessionId }) => {
        try {
            const page = await getPage(sessionId);
            const response = await page.goto(url, { waitUntil: "load" });
            const payload = {
                success: true,
                url: page.url(),
                title: await page.title(),
                status: response?.status(),
            };
            return textResult(payload);
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("browser_click", {
        title: "Click element",
        description: "Click the first element matching a CSS selector on the shared browser page and report success/failure plus the current URL after the click.",
        inputSchema: clickInput,
        outputSchema: clickOutput,
    }, async ({ selector, timeoutMs, sessionId }) => {
        try {
            const page = await getPage(sessionId);
            await page.click(selector, timeoutMs ? { timeout: timeoutMs } : undefined);
            return textResult({ success: true, url: page.url() });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("browser_type", {
        title: "Type into element",
        description: "Type text into the first element matching a CSS selector on the shared browser page and report success/failure.",
        inputSchema: typeInput,
        outputSchema: typeOutput,
    }, async ({ selector, text, timeoutMs, sessionId }) => {
        try {
            const page = await getPage(sessionId);
            await page.fill(selector, text, timeoutMs ? { timeout: timeoutMs } : undefined);
            return textResult({ success: true });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("browser_screenshot", {
        title: "Screenshot browser page",
        description: "Capture a PNG screenshot of the current shared browser page and save it to disk, returning the saved file path.",
        inputSchema: screenshotInput,
        outputSchema: screenshotOutput,
    }, async ({ path: outputPath, sessionId }) => {
        try {
            const page = await getPage(sessionId);
            const targetPath = outputPath ?? (await defaultScreenshotPath());
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await page.screenshot({ path: targetPath, type: "png" });
            // Default (non-fullPage) screenshots capture exactly the viewport, so
            // viewport size doubles as the saved image's pixel dimensions —
            // callers use this to convert an element's boundingBox() (from
            // browser_bounding_box) into fractions of the screenshot for
            // annotating a report slide.
            const viewport = page.viewportSize();
            return textResult({
                success: true,
                path: targetPath,
                width: viewport?.width,
                height: viewport?.height,
            });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("browser_bounding_box", {
        title: "Get element bounding box",
        description: "Return the pixel bounding box (x, y, width, height, relative to the top-left of the viewport) of " +
            "the first element matching a CSS selector, plus the current viewport size. Intended for computing " +
            "where on a browser_screenshot image an issue is located (e.g. to annotate a report slide) — does " +
            "not judge or draw anything itself.",
        inputSchema: boundingBoxInput,
        outputSchema: boundingBoxOutput,
    }, async ({ selector, sessionId }) => {
        try {
            const page = await getPage(sessionId);
            const box = await page.locator(selector).first().boundingBox();
            if (!box) {
                return textResult({ success: false, error: `element not visible or not found: ${selector}` }, true);
            }
            const viewport = page.viewportSize();
            return textResult({
                success: true,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                viewportWidth: viewport?.width,
                viewportHeight: viewport?.height,
            });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("browser_new_session", {
        title: "Open a new browser tab/session",
        description: "Open a new tab (Playwright page) within the same shared browser context, so it shares login/cookies " +
            "with the default tab and any other open sessions. Use this to test several screens/menus " +
            "concurrently — call the other browser_* tools with the returned sessionId to act on this tab " +
            "specifically, in parallel with other sessions' tool calls.",
        inputSchema: newSessionInput,
        outputSchema: newSessionOutput,
    }, async ({ sessionId }) => {
        try {
            const resolvedId = sessionId ?? randomUUID();
            await getPage(resolvedId);
            return textResult({ success: true, sessionId: resolvedId });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("browser_close_session", {
        title: "Close a browser tab/session",
        description: "Close a tab/session previously opened with browser_new_session, freeing its resources. Closing the " +
            `default session ("${DEFAULT_SESSION_ID}") is allowed — a fresh one is created automatically the next ` +
            "time a browser_* tool is called without a sessionId.",
        inputSchema: closeSessionInput,
        outputSchema: closeSessionOutput,
    }, async ({ sessionId }) => {
        try {
            const page = pages.get(sessionId);
            if (page) {
                await page.close();
                pages.delete(sessionId);
            }
            return textResult({ success: true });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
}
async function defaultScreenshotPath() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "peekly-screenshot-"));
    return path.join(dir, `screenshot-${Date.now()}.png`);
}
/** Exposed for tests / graceful shutdown from the server entrypoint. */
export { closeBrowser };
//# sourceMappingURL=browser.js.map