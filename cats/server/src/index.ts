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
 * Cats.com Article Explorer — MCP Server
 *
 * Tools:
 *   list_articles(category?) → Article[]   → widget
 *   search_articles(query)   → Article[]   → widget
 *
 * Widget resource URI: https://cats.com/articles
 * mimeType: text/html+skybridge
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

// Allow cats.com images in the widget sandbox
const widgetCspResourceDomains = configuredWidgetCspResourceDomains ?? ["https://cats.com"];
const widgetCspConnectDomains = configuredWidgetCspConnectDomains ?? [];

const WIDGET_URI = "https://cats.com/articles";

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// ============================================================================
// Article Dataset
// ============================================================================

interface Article {
  title: string;
  author: string;
  category: string;
  url: string;
  imageUrl?: string;
}

const ARTICLES: Article[] = [
  {
    title: "The Annual Cat Wellness Exam: What Happens, What to Expect, and What it Costs",
    author: "Dr. Chris Vanderhoof, DVM, MPH",
    category: "Cat Basics",
    url: "https://cats.com/cat-wellness-exam",
    imageUrl: "https://cats.com/wp-content/uploads/2024/01/A-white-and-grey-Scottish-Fold-lying-sitting-up-on-a-table-with-a-stethoscope-in-the-foreground-768x384.jpg",
  },
  {
    title: "What Is Cat Chattering & Why Do Cats Do It",
    author: "Melina Grin",
    category: "Cat Behavior",
    url: "https://cats.com/cat-chattering",
    imageUrl: "https://cats.com/wp-content/uploads/2021/11/new-chatter-feature-e1656372841162-768x520.jpg",
  },
  {
    title: "What Does It Mean When a Cat Rubs Against You?",
    author: "Melina Grin",
    category: "Cat Behavior",
    url: "https://cats.com/what-does-it-mean-when-a-cat-rubs-against-you",
    imageUrl: "https://cats.com/wp-content/uploads/2022/04/cat-rubbing-against-you-compressed-768x384.jpg",
  },
  {
    title: "Basal Cell Tumors in Cats: Causes, Symptoms, and Treatment",
    author: "Dr. Chris Vanderhoof, DVM, MPH",
    category: "Cat Diseases and Medical Conditions",
    url: "https://cats.com/basal-cell-tumors-in-cats",
    imageUrl: "https://cats.com/wp-content/uploads/2026/03/Grey-White-Short-Hair-Tuxedo-Brown-Tabby-Cats-Indoor-At-Home-2-compressed-540x360.jpg",
  },
  {
    title: "I Gave a Home to an Unadoptable Semiferal Cat - and You Should, Too",
    author: "Kellie B. Gormly",
    category: "Cat Stories",
    url: "https://cats.com/news/unadoptable-semiferal-cat",
    imageUrl: "https://cats.com/wp-content/uploads/2026/03/elf-compressed-540x360.jpg",
  },
  {
    title: "The 5 Best Cat Subscription Boxes—We Tested Them All",
    author: "Cats.com Editorial Team",
    category: "Cat Products",
    url: "https://cats.com/best-cat-subscription-box",
  },
  {
    title: "She Brought her New Cat on a Bus Adventure!",
    author: "Cats.com Editorial Team",
    category: "Cat Stories",
    url: "https://cats.com/news/cat-on-a-bus-adventure",
  },
  {
    title: "5 Best Flushable Cat Litter",
    author: "Cats.com Editorial Team",
    category: "Cat Products",
    url: "https://cats.com/best-flushable-cat-litter",
  },
  {
    title: "The 9 Best Lickable Cat Treats—We Tested Them All",
    author: "Cats.com Editorial Team",
    category: "Cat Products",
    url: "https://cats.com/best-lickable-cat-treats",
  },
  {
    title: "Can Cats Eat Chicken Liver?",
    author: "Cats.com Editorial Team",
    category: "Cat Nutrition",
    url: "https://cats.com/can-cats-eat-chicken-liver",
  },
  {
    title: "Cat Who Can't Meow Has The Softest Voice You've Ever Heard",
    author: "Cats.com Editorial Team",
    category: "Cat Stories",
    url: "https://cats.com/news/cat-who-cant-meow-has-the-softest-voice-youve-ever-heard",
  },
  {
    title: "This Disabled Cat Became a Pampered Queen in Her New Home",
    author: "Cats.com Editorial Team",
    category: "Cat Stories",
    url: "https://cats.com/news/disabled-cat-became-a-pampered-queen",
  },
  {
    title: "This Lonely Senior Cat Became BFFs with a Toy Banana, And It's The Cutest.",
    author: "Cats.com Editorial Team",
    category: "Cat Stories",
    url: "https://cats.com/news/lonely-senior-cat-became-bffs",
  },
  {
    title: "Unbiased Purina Cat Food Review",
    author: "Cats.com Editorial Team",
    category: "Cat Products",
    url: "https://cats.com/purina-cat-food-review",
  },
  {
    title: "Why Do Cats Knock Things Off Tables?",
    author: "Melina Grin",
    category: "Cat Behavior",
    url: "https://cats.com/why-do-cats-knock-things-off-tables",
  },
  {
    title: "How to Tell If Your Cat Is in Pain",
    author: "Dr. Chris Vanderhoof, DVM, MPH",
    category: "Cat Health",
    url: "https://cats.com/how-to-tell-if-your-cat-is-in-pain",
  },
  {
    title: "Why Does My Cat Bite Me?",
    author: "Melina Grin",
    category: "Cat Behavior",
    url: "https://cats.com/why-does-my-cat-bite-me",
  },
  {
    title: "Best Automatic Cat Feeders: Top Picks for Busy Pet Owners",
    author: "Cats.com Editorial Team",
    category: "Cat Products",
    url: "https://cats.com/best-automatic-cat-feeder",
  },
  {
    title: "How to Introduce a New Cat to Your Home",
    author: "Melina Grin",
    category: "Cat Basics",
    url: "https://cats.com/how-to-introduce-a-new-cat",
  },
  {
    title: "Common Cat Dental Problems and How to Prevent Them",
    author: "Dr. Chris Vanderhoof, DVM, MPH",
    category: "Cat Health",
    url: "https://cats.com/cat-dental-problems",
  },
  {
    title: "Best Cat Food for Indoor Cats",
    author: "Cats.com Editorial Team",
    category: "Cat Nutrition",
    url: "https://cats.com/best-cat-food-for-indoor-cats",
  },
  {
    title: "Understanding Cat Body Language",
    author: "Melina Grin",
    category: "Cat Behavior",
    url: "https://cats.com/cat-body-language",
  },
  {
    title: "How to Keep Your Cat Mentally Stimulated",
    author: "Melina Grin",
    category: "Cat Basics",
    url: "https://cats.com/how-to-keep-your-cat-mentally-stimulated",
  },
  {
    title: "Best Cat Carriers for Travel",
    author: "Cats.com Editorial Team",
    category: "Cat Products",
    url: "https://cats.com/best-cat-carrier",
  },
  {
    title: "Signs Your Cat May Have Diabetes",
    author: "Dr. Chris Vanderhoof, DVM, MPH",
    category: "Cat Diseases and Medical Conditions",
    url: "https://cats.com/cat-diabetes",
  },
];

// ============================================================================
// Helpers
// ============================================================================

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
// MCP Server
// ============================================================================

const mcpServer = new McpServer({
  name: "cats-com-article-explorer",
  version: "1.0.0",
});

// ── Widget resource ──────────────────────────────────────────────────────────

mcpServer.registerResource(
  "cats-articles-widget",
  WIDGET_URI,
  {
    title: "Cats.com Article Explorer",
    description: "Browse and search cat care articles, product reviews, and veterinary guides from Cats.com.",
    mimeType: "text/html+skybridge",
  },
  async () => {
    const widgetMeta: Record<string, unknown> = {
      "openai/widgetDescription": "Cats.com Article Explorer — browse and search cat care articles.",
      "openai/widgetPrefersBorder": true,
      "openai/widgetCSP": {
        resource_domains: widgetCspResourceDomains,
        connect_domains: widgetCspConnectDomains,
      },
    };

    const cssAsset = readWidgetAsset(widgetStyleName);
    const jsAsset = readWidgetAsset(widgetScriptName);
    if (!cssAsset || !jsAsset) {
      throw new Error("Missing built widget assets. Run npm run build:web before serving the widget.");
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

// ── Tool: list_articles ──────────────────────────────────────────────────────

mcpServer.registerTool(
  "list_articles",
  {
    title: "List Cats.com Articles",
    description: "Retrieve a list of cat care articles from Cats.com. Optionally filter by category (e.g. 'Cat Behavior', 'Cat Health', 'Cat Products', 'Cat Nutrition', 'Cat Basics', 'Cat Stories', 'Cat Diseases and Medical Conditions').",
    inputSchema: {
      category: z.string().optional().describe("Optional category filter (case-insensitive)"),
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Fetching cat articles...",
      "openai/toolInvocation/invoked": "Articles loaded",
    },
  },
  async ({ category }) => {
    const filtered = category
      ? ARTICLES.filter((a) => a.category.toLowerCase() === category.toLowerCase())
      : ARTICLES;

    const label = category ? `category "${category}"` : "all categories";
    const count = filtered.length;

    return {
      structuredContent: {
        articles: filtered,
        category: category ?? null,
        query: null,
        total: count,
      },
      content: [
        {
          type: "text",
          text: `Found ${count} article${count !== 1 ? "s" : ""} for ${label}.`,
          annotations: { audience: ["assistant"] },
        },
      ],
      _meta: {},
    };
  },
);

// ── Tool: search_articles ────────────────────────────────────────────────────

mcpServer.registerTool(
  "search_articles",
  {
    title: "Search Cats.com Articles",
    description: "Search for cat care articles on Cats.com by keyword. Matches against article titles and categories.",
    inputSchema: {
      query: z.string().min(1).describe("Search keyword or phrase"),
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Searching articles...",
      "openai/toolInvocation/invoked": "Search complete",
    },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const filtered = ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q),
    );

    const count = filtered.length;

    return {
      structuredContent: {
        articles: filtered,
        query,
        category: null,
        total: count,
      },
      content: [
        {
          type: "text",
          text: `Found ${count} article${count !== 1 ? "s" : ""} matching "${query}".`,
          annotations: { audience: ["assistant"] },
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
    res.send("Cats.com Article Explorer MCP server is running.");
  });

  app.listen(port, bindHost, () => {
    console.log(`MCP server listening on port ${port}`);
    console.log(`MCP server bind host: ${bindHost}`);
    console.log(`Test the server at: http://localhost:${port}/mcp`);
    if (!allowedHosts) {
      console.warn(
        "Host header validation is disabled. Set MCP_ALLOWED_HOSTS (comma-separated) to enable DNS rebinding protection.",
      );
    }
  });
}
