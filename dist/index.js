#!/usr/bin/env node
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerCrawlerTools } from "./tools/crawler.js";
import { registerCostTools } from "./tools/cost.js";
import { registerPlatformTools } from "./tools/platform.js";
import { registerReportTools } from "./tools/report.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));
const server = new McpServer({
    name: "peekly-mcp",
    version: packageJson.version,
});
registerBrowserTools(server);
registerCrawlerTools(server);
registerCostTools(server);
registerPlatformTools(server);
registerReportTools(server);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error("Peekly MCP server failed to start:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map