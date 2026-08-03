import { z } from "zod";
import type { Page } from "playwright";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getPage } from "./browser.js";

/**
 * PROVISIONAL default (design doc section 6 leaves the crawl scope limit
 * unresolved). 50 pages is a reasonable ceiling to avoid runaway crawls on
 * large sites while still covering typical small/medium apps. Revisit once
 * the design doc's open issue on "크롤링 범위 제한 기준" is settled — do not
 * treat this as a confirmed spec (see CONVENTIONS.md section 8).
 */
const DEFAULT_MAX_PAGES = 50;

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

/**
 * Normalizes a URL for dedup/visited-set purposes: drops the hash fragment
 * (fragments identify in-page anchors, not distinct screens) and any
 * trailing slash on the path, so `/foo` and `/foo/` are treated as the same
 * screen. This is a provisional normalization rule, not a confirmed spec.
 */
function normalizeUrl(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

async function extractLinks(page: Page): Promise<string[]> {
  // Note: this callback runs in the browser page context, not Node — the
  // project's tsconfig has no "dom" lib, so DOM element types (e.g.
  // HTMLAnchorElement) aren't available here. `href` is read via a loose
  // cast instead of pulling in DOM lib types just for this one call site.
  return page.$$eval("a[href]", (anchors) =>
    anchors
      .map((a) => (a as unknown as { href: string }).href)
      .filter((href): href is string => typeof href === "string" && href.length > 0)
  );
}

const sitemapCrawlInput = {
  startUrl: z.string().describe("The URL to start crawling from."),
  maxPages: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      `Maximum number of pages to visit before stopping (safety limit against unbounded crawls). ` +
        `Provisional default: ${DEFAULT_MAX_PAGES} (design doc's crawl-scope-limit question is still open).`
    ),
};

const sitemapCrawlOutput = {
  success: z.boolean(),
  urls: z.array(z.string()).optional(),
  totalCount: z.number().optional(),
  truncated: z.boolean().optional(),
  error: z.string().optional(),
};

export function registerCrawlerTools(server: McpServer): void {
  server.registerTool(
    "sitemap_crawl",
    {
      title: "Crawl sitemap",
      description:
        "Starting from a URL, follow same-origin links (BFS) using the shared, already-logged-in browser session to discover the set of reachable screens. External-domain links are never visited. Stops once maxPages is reached and reports whether the crawl was truncated. Does not judge which screens are worth testing — it only reports what it found.",
      inputSchema: sitemapCrawlInput,
      outputSchema: sitemapCrawlOutput,
    },
    async ({ startUrl, maxPages }) => {
      const pageLimit = maxPages ?? DEFAULT_MAX_PAGES;
      try {
        const normalizedStart = normalizeUrl(startUrl);
        if (!normalizedStart) {
          return textResult(
            { success: false, error: `Invalid or unsupported start URL: ${startUrl}` },
            true
          );
        }

        const startOrigin = new URL(normalizedStart).origin;
        const visited = new Set<string>();
        const queue: string[] = [normalizedStart];
        const discovered: string[] = [];
        let truncated = false;

        const page = await getPage();

        while (queue.length > 0) {
          if (visited.size >= pageLimit) {
            truncated = queue.length > 0;
            break;
          }
          const current = queue.shift();
          if (current === undefined || visited.has(current)) {
            continue;
          }
          visited.add(current);
          discovered.push(current);

          await page.goto(current, { waitUntil: "load" });
          const rawLinks = await extractLinks(page);

          for (const rawLink of rawLinks) {
            const normalized = normalizeUrl(rawLink);
            if (!normalized) continue;
            if (new URL(normalized).origin !== startOrigin) continue; // external domain: excluded per design
            if (visited.has(normalized) || queue.includes(normalized)) continue;
            if (visited.size + queue.length >= pageLimit) {
              truncated = true;
              continue;
            }
            queue.push(normalized);
          }
        }

        return textResult({
          success: true,
          urls: discovered,
          totalCount: discovered.length,
          truncated,
        });
      } catch (error) {
        return textResult({ success: false, error: errorMessage(error) }, true);
      }
    }
  );
}
