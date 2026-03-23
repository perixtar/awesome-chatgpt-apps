/**
 * Generic MCP Server Tests
 *
 * These tests verify that any MCP server built from this boilerplate works correctly
 * for both stdio and HTTP transports. The tests are intentionally generic and will
 * work regardless of what tools/resources you add to your server.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

describe("MCP Server - Stdio Transport", () => {
  let serverProcess: ChildProcess;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Start the MCP server in stdio mode
    serverProcess = spawn("tsx", ["server/src/index.ts", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Create client and connect via stdio transport
    transport = new StdioClientTransport({
      command: "tsx",
      args: ["server/src/index.ts", "--stdio"],
    });

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    serverProcess?.kill();
  });

  it("should initialize successfully", async () => {
    const serverInfo = client.getServerVersion();
    expect(serverInfo).toBeDefined();
    expect(serverInfo?.name).toBeDefined();
    expect(serverInfo?.version).toBeDefined();
  });

  it("should list available tools", async () => {
    const result = await client.listTools();
    expect(result).toBeDefined();
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    // Every MCP server should have at least one tool
    expect(result.tools.length).toBeGreaterThan(0);

    // Verify tool structure
    result.tools.forEach((tool) => {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe("string");
      expect(tool.description).toBeDefined();
    });
  });

  it("should list available resources", async () => {
    const result = await client.listResources();
    expect(result).toBeDefined();
    expect(result.resources).toBeDefined();
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.resources.length).toBeGreaterThan(0);
    expect(result.resources[0]?.uri).toBeDefined();
    expect((result.resources[0] as { mimeType?: string } | undefined)?.mimeType).toBe(
      "text/html+skybridge",
    );
  });

  it("should call a tool successfully", async () => {
    // Get the first available tool
    const toolsList = await client.listTools();
    expect(toolsList.tools.length).toBeGreaterThan(0);

    const firstTool = toolsList.tools[0];

    // Call the tool (with no arguments, assuming tools handle this gracefully)
    const result = await client.callTool({
      name: firstTool.name,
      arguments: {},
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("should handle ping/pong", async () => {
    const result = await client.ping();
    expect(result).toBeDefined();
  });
});

describe("MCP Server - HTTP Transport", () => {
  let serverProcess: ChildProcess;
  let client: Client;
  let transport: StreamableHTTPClientTransport;
  const serverPort = 3001; // Use different port to avoid conflicts
  const baseUrl = `http://localhost:${serverPort}`;

  beforeAll(async () => {
    // Start the MCP server in HTTP mode
    serverProcess = spawn("tsx", ["server/src/index.ts"], {
      env: { ...process.env, PORT: serverPort.toString() },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create HTTP client
    transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));

    client = new Client(
      {
        name: "test-client-http",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    serverProcess?.kill();
    // Give server time to shut down
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it("should respond to health check endpoint", async () => {
    const response = await fetch(baseUrl);
    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).toContain("MCP server is running");
  });

  it("should list tools via HTTP client", async () => {
    const result = await client.listTools();
    expect(result).toBeDefined();
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    const firstTool = result.tools[0] as { _meta?: Record<string, unknown> } | undefined;
    expect(firstTool?._meta?.["openai/outputTemplate"]).toBe("ui://widget/widget.html");
  });

  it("should return widget HTML with inline CSS/JS assets", async () => {
    const resources = await client.listResources();
    expect(resources.resources.length).toBeGreaterThan(0);
    const firstResource = resources.resources[0];
    expect(firstResource.uri).toBeDefined();

    const readResult = await client.readResource({ uri: firstResource.uri });
    const contents = Array.isArray(readResult.contents)
      ? readResult.contents
      : [];
    expect(contents.length).toBeGreaterThan(0);

    const htmlEntry = contents.find(
      (entry) => typeof (entry as any).text === "string",
    ) as { text?: string; _meta?: Record<string, unknown> } | undefined;
    const html = htmlEntry?.text ?? "";
    // Assets must be inlined to avoid proxy interstitial issues (e.g. ngrok)
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
    expect(html).toContain('<script type="module">');
    expect(html).toContain('<div id="root"></div>');
    // Must NOT contain external asset references
    expect(html).not.toMatch(/src=".*\/widget-assets\/app\.js"/);
    expect(html).not.toMatch(/href=".*\/widget-assets\/style\.css"/);

    const widgetMeta = htmlEntry?._meta as Record<string, unknown> | undefined;
    expect(widgetMeta).toBeDefined();
    expect(widgetMeta?.["openai/widgetCSP"]).toBeDefined();
  });

  it("should call a tool via HTTP client", async () => {
    // Get the first available tool
    const toolsList = await client.listTools();
    expect(toolsList.tools.length).toBeGreaterThan(0);

    const firstTool = toolsList.tools[0];

    // Call the tool
    const result = await client.callTool({
      name: firstTool.name,
      arguments: {},
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("should expose streamable GET/DELETE MCP endpoints", async () => {
    const getRes = await fetch(`${baseUrl}/mcp`);
    expect(getRes.status).toBe(400);

    const deleteRes = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
    expect(deleteRes.status).toBe(400);
  });
});
