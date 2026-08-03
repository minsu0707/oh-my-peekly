import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBrowserTools } from "./tools/browser.js";

const server = new McpServer({
  name: "peekly-mcp",
  version: "0.1.0",
});

registerBrowserTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Peekly MCP server failed to start:", error);
  process.exit(1);
});
