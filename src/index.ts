import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerCrawlerTools } from "./tools/crawler.js";
import { registerCostTools } from "./tools/cost.js";
import { registerPlatformTools } from "./tools/platform.js";
import { registerReportTools } from "./tools/report.js";

const server = new McpServer({
  name: "peekly-mcp",
  version: "0.1.0",
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
