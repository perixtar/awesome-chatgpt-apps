import { randomUUID } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { z } from "zod";

/*
 * Nike ChatGPT App MCP Server
 *
 * Tools:
 *  - list_products: browse Nike collections by optional category
 *  - search_products_by_name: find products by name keyword
 *
 * Widget asset delivery is inline-only via readWidgetAsset().
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const transportMode = args.includes("--stdio") ? "stdio" : "http";
const port = Number(process.env.PORT) || 3000;
const bindHost = "0.0.0.0";
const parsedAllowedHosts = process.env.MCP_ALLOWED_HOSTS
  ?.split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowedHosts = parsedAllowedHosts?.length ? parsedAllowedHosts : undefined;
const configuredWidgetCspResourceDomains = parseDomainList(process.env.WIDGET_CSP_RESOURCE_DOMAINS);
const configuredWidgetCspConnectDomains = parseDomainList(process.env.WIDGET_CSP_CONNECT_DOMAINS);

const widgetDistDir = path.resolve(__dirname, "../../web/dist");
const widgetScriptName = "app.js";
const widgetStyleName = "style.css";
const widgetCspResourceDomains = configuredWidgetCspResourceDomains ?? ["https://static.nike.com"];
const widgetCspConnectDomains = configuredWidgetCspConnectDomains ?? ["https://www.nike.com"];

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

function extractSessionId(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function parseDomainList(value: string | undefined): string[] | null {
  if (!value || value.trim() === "") return null;
  const domains = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalized: string[] = [];
  for (const domain of domains) {
    try {
      const origin = new URL(domain).origin;
      if (!normalized.includes(origin)) {
        normalized.push(origin);
      }
    } catch {
      // Ignore invalid domain entries.
    }
  }
  return normalized.length > 0 ? normalized : null;
}

function readWidgetAsset(assetName: string): { body: string; contentType: string } | null {
  if (assetName !== widgetScriptName && assetName !== widgetStyleName) {
    return null;
  }

  const filePath = path.join(widgetDistDir, assetName);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return {
    body: fs.readFileSync(filePath, "utf8"),
    contentType: assetName.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/javascript; charset=utf-8",
  };
}

// ============================================================================
// Nike product dataset
// ============================================================================

interface NikeProduct {
  id: string;
  productName: string;
  productUrl: string;
  imageUrl?: string;
  category: string;
  tagline?: string;
}

const NIKE_PRODUCTS: NikeProduct[] = [
  // Featured / Hero
  {
    id: "air-max-dn8",
    productName: "Air Max DN8",
    productUrl: "https://www.nike.com/w/lifestyle-13jrm",
    imageUrl: "https://static.nike.com/a/images/f_auto/dpr_1.0,cs_srgb/w_1904,c_limit/31ab5003-caf9-4be9-977e-b94205db833e/nike-just-do-it.jpg",
    category: "Lifestyle",
    tagline: "Get out of the mix.",
  },
  {
    id: "nikeskims-spring-26",
    productName: "NikeSKIMS Spring '26 Gym Essentials",
    productUrl: "https://www.nike.com/w/nikeskims-b2asd",
    category: "Training",
    tagline: "Available Now",
  },
  {
    id: "joga-sinistro",
    productName: "Jordan x Brasil Futebol – Joga Sinistro",
    productUrl: "https://www.nike.com/w/jordan-x-brasil-futebol-3eilk",
    imageUrl: "https://static.nike.com/a/images/f_auto/dpr_1.0,cs_srgb/h_791,c_limit/c9bc3b6b-ba7c-4aa4-b4a2-9f2890a7a385/nike-just-do-it.jpg",
    category: "Football",
    tagline: "Brasil Futebol x Jordan Brand.",
  },
  {
    id: "nwsl-kits-2026",
    productName: "2026 NWSL Kits",
    productUrl: "https://www.nike.com/w/national-womens-soccer-league-5yy3b",
    category: "Football",
    tagline: "Your league, your look.",
  },
  {
    id: "after-dark-tour",
    productName: "After Dark Tour – Race The Night",
    productUrl: "https://afterdarktour.nike.com/",
    imageUrl: "https://static.nike.com/a/images/f_auto/dpr_1.0,cs_srgb/h_791,c_limit/de2ec51e-3987-49c8-8e9a-54505d714bdc/nike-just-do-it.jpg",
    category: "Running",
    tagline: "Built for women, powered by Nike.",
  },
  // Basketball
  {
    id: "basketball-footwear",
    productName: "Nike Basketball Footwear",
    productUrl: "https://www.nike.com/w/basketball-shoes-3glsmzy7ok",
    category: "Basketball",
    tagline: "Certified Game-Changers",
  },
  {
    id: "mens-basketball",
    productName: "Men's Basketball",
    productUrl: "https://www.nike.com/w/mens-basketball-3glsmznik1",
    category: "Basketball",
  },
  {
    id: "womens-basketball",
    productName: "Women's Basketball",
    productUrl: "https://www.nike.com/w/womens-basketball-3glsmz5e1x6",
    category: "Basketball",
  },
  {
    id: "kids-basketball",
    productName: "Kids' Basketball",
    productUrl: "https://www.nike.com/w/kids-basketball-3glsmzv4dh",
    category: "Basketball",
  },
  {
    id: "nba-shop",
    productName: "NBA Shop",
    productUrl: "https://www.nike.com/w/nba-1vofi",
    category: "Basketball",
  },
  // Running
  {
    id: "running-all",
    productName: "Nike Running",
    productUrl: "https://www.nike.com/w/running-37v7j",
    category: "Running",
  },
  {
    id: "mens-running",
    productName: "Men's Running",
    productUrl: "https://www.nike.com/w/mens-running-37v7jznik1",
    category: "Running",
  },
  {
    id: "womens-running",
    productName: "Women's Running",
    productUrl: "https://www.nike.com/w/womens-running-37v7jz5e1x6",
    category: "Running",
  },
  {
    id: "kids-running",
    productName: "Kids' Running",
    productUrl: "https://www.nike.com/w/kids-running-37v7jzv4dh",
    category: "Running",
  },
  // Golf
  {
    id: "golf-all",
    productName: "Nike Golf",
    productUrl: "https://www.nike.com/w/golf-23q9w",
    category: "Golf",
  },
  {
    id: "mens-golf",
    productName: "Men's Golf",
    productUrl: "https://www.nike.com/w/mens-golf-23q9wznik1",
    category: "Golf",
  },
  {
    id: "womens-golf",
    productName: "Women's Golf",
    productUrl: "https://www.nike.com/w/womens-golf-23q9wz5e1x6",
    category: "Golf",
  },
  {
    id: "jordan-golf",
    productName: "Jordan Golf",
    productUrl: "https://www.nike.com/w/jordan-golf-23q9wz37eef",
    category: "Golf",
  },
  // Baseball
  {
    id: "kids-baseball",
    productName: "Kids' Baseball",
    productUrl: "https://www.nike.com/w/kids-baseball-99fchzv4dh",
    category: "Baseball",
  },
  // Lifestyle / Jordan
  {
    id: "air-force-1",
    productName: "Air Force 1",
    productUrl: "https://www.nike.com/w/air-force-1-3jmfh",
    category: "Lifestyle",
    tagline: "An icon since 1982.",
  },
  {
    id: "air-jordan-1",
    productName: "Air Jordan 1",
    productUrl: "https://www.nike.com/w/air-jordan-1-33qnf",
    category: "Lifestyle",
    tagline: "The original.",
  },
];

const CATEGORIES = ["All", "Running", "Basketball", "Golf", "Football", "Lifestyle", "Training", "Baseball"];

function filterProducts(category?: string): NikeProduct[] {
  if (!category || category.toLowerCase() === "all") {
    return NIKE_PRODUCTS;
  }
  return NIKE_PRODUCTS.filter(
    (p) => p.category.toLowerCase() === category.toLowerCase(),
  );
}

function searchProducts(query: string): NikeProduct[] {
  const q = query.toLowerCase();
  return NIKE_PRODUCTS.filter(
    (p) =>
      p.productName.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.tagline?.toLowerCase().includes(q) ?? false),
  );
}

// ============================================================================
// MCP Server
// ============================================================================

const mcpServer = new McpServer({
  name: "nike-chatgpt-app",
  version: "1.0.0",
});

const WIDGET_URI = "ui://widget/widget.html";

// ── Widget resource ──────────────────────────────────────────────────────────

mcpServer.registerResource(
  "nike-products-widget",
  WIDGET_URI,
  {
    title: "Nike Products Widget",
    description: "Browse and discover Nike sportswear and footwear collections.",
    mimeType: "text/html+skybridge",
  },
  async () => {
    const widgetMeta: Record<string, unknown> = {
      "openai/widgetDescription": "Browse Nike products and collections.",
      "openai/widgetPrefersBorder": true,
      "openai/widgetCSP": {
        resource_domains: widgetCspResourceDomains,
        connect_domains: widgetCspConnectDomains,
      },
    };

    const cssAsset = readWidgetAsset(widgetStyleName);
    const jsAsset = readWidgetAsset(widgetScriptName);
    if (!cssAsset || !jsAsset) {
      throw new Error(
        "Missing built widget assets. Run npm run build:web before serving the widget.",
      );
    }

    return {
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: "text/html+skybridge",
          _meta: widgetMeta,
          text: [
            `<style>${cssAsset.body}</style>`,
            '<div id="root"></div>',
            `<script type="module">${jsAsset.body}</script>`,
          ].join("\n"),
        },
      ],
    };
  },
);

// ── Tool: list_products ──────────────────────────────────────────────────────

mcpServer.registerTool(
  "list_products",
  {
    title: "List Nike Products",
    description:
      "Retrieve a list of available Nike products and collections. Optionally filter by category (Running, Basketball, Golf, Football, Lifestyle, Training, Baseball).",
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe(
          "Optional category filter. One of: Running, Basketball, Golf, Football, Lifestyle, Training, Baseball, or All.",
        ),
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Browsing Nike products…",
      "openai/toolInvocation/invoked": "Nike products loaded",
    },
  },
  async ({ category }) => {
    const products = filterProducts(category);
    const label = category && category.toLowerCase() !== "all" ? category : "All";

    return {
      structuredContent: {
        products,
        category: label,
        categories: CATEGORIES,
        view: "list",
      },
      content: [
        {
          type: "text" as const,
          text: `Found ${products.length} Nike product${products.length !== 1 ? "s" : ""}${category ? ` in category "${category}"` : ""}.`,
          annotations: { audience: ["assistant"] as ["assistant"] },
        },
      ],
      _meta: {},
    };
  },
);

// ── Tool: search_products_by_name ────────────────────────────────────────────

mcpServer.registerTool(
  "search_products_by_name",
  {
    title: "Search Nike Products",
    description:
      "Find specific Nike products by name or keyword (e.g. 'Air Max', 'Jordan', 'running shoes').",
    inputSchema: {
      productName: z
        .string()
        .min(1)
        .describe("The product name or keyword to search for."),
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Searching Nike products…",
      "openai/toolInvocation/invoked": "Search complete",
    },
  },
  async ({ productName }) => {
    const products = searchProducts(productName);

    return {
      structuredContent: {
        products,
        query: productName,
        categories: CATEGORIES,
        view: "search",
      },
      content: [
        {
          type: "text" as const,
          text:
            products.length > 0
              ? `Found ${products.length} Nike product${products.length !== 1 ? "s" : ""} matching "${productName}".`
              : `No Nike products found matching "${productName}". Try a different search term.`,
          annotations: { audience: ["assistant"] as ["assistant"] },
        },
      ],
      _meta: {},
    };
  },
);

// ============================================================================
// Transport
// ============================================================================

if (transportMode === "stdio") {
  const transport = new StdioServerTransport();

  mcpServer
    .connect(transport)
    .catch((error: unknown) => {
      process.stderr.write(`Failed to start stdio server: ${error}\n`);
      process.exit(1);
    });

  process.stderr.write("MCP server running in stdio mode\n");
} else {
  const app = createMcpExpressApp({
    host: bindHost,
    allowedHosts,
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = extractSessionId(req.headers["mcp-session-id"]);

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            transports[newSessionId] = transport;
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };
        await mcpServer.connect(transport);
      } else {
        res.status(400).json({ error: "Bad Request: No session ID provided" });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = extractSessionId(req.headers["mcp-session-id"]);
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP GET request:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = extractSessionId(req.headers["mcp-session-id"]);
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP DELETE request:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  });

  app.get("/", (_req: Request, res: Response) => {
    res.send("Nike ChatGPT App MCP server is running.");
  });

  app.listen(port, bindHost, () => {
    console.log(`Nike MCP server listening on port ${port}`);
    console.log(`MCP server bind host: ${bindHost}`);
    console.log(`Test the server at: http://localhost:${port}/mcp`);
    if (!allowedHosts) {
      console.warn(
        "Host header validation is disabled. Set MCP_ALLOWED_HOSTS to enable DNS rebinding protection.",
      );
    }
  });
}
