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
 * Starbucks ChatGPT App MCP Server
 *
 * Widget asset delivery is inline-only:
 * - read built files from web/dist via readWidgetAsset()
 * - embed CSS/JS directly into the widget HTML
 * - fail fast if the built widget assets are missing
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

const widgetDistDir = path.resolve(__dirname, "../../web/dist");
const widgetScriptName = "app.js";
const widgetStyleName = "style.css";

// Starbucks image CDN is allowed as a resource domain
const widgetCspResourceDomains = ["https://content-prod-live.cert.starbucks.com"];
const widgetCspConnectDomains: string[] = [];

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

function extractSessionId(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
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
// Starbucks Menu Data
// ============================================================================

interface MenuItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  imageUrl: string;
  description: string;
  link: string;
}

const MENU_ITEMS: MenuItem[] = [
  // Trending / Fan Favorites
  {
    id: "iced-ube-coconut-macchiato",
    name: "Iced Ube Coconut Macchiato",
    category: "Drinks",
    subcategory: "Cold Coffee",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-106924.jpg",
    description: "Layers of ube-flavored sauce, creamy coconut milk, and Starbucks® Espresso poured over ice.",
    link: "https://www.starbucks.com/menu/drinks/cold-coffee",
  },
  {
    id: "iced-lavender-cream-matcha",
    name: "Iced Lavender Cream Matcha",
    category: "Drinks",
    subcategory: "Matcha",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-106903.jpg",
    description: "Matcha green tea latte with floral lavender cream, poured over ice.",
    link: "https://www.starbucks.com/menu/drinks/matcha",
  },
  {
    id: "caramel-macchiato",
    name: "Caramel Macchiato",
    category: "Drinks",
    subcategory: "Hot Coffee",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74985.jpg",
    description: "Freshly steamed milk with vanilla-flavored syrup, marked with espresso and topped with caramel drizzle.",
    link: "https://www.starbucks.com/menu/drinks/hot-coffee",
  },
  {
    id: "pumpkin-spice-latte",
    name: "Pumpkin Spice Latte",
    category: "Drinks",
    subcategory: "Hot Coffee",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-59344.jpg",
    description: "Espresso, steamed milk, and real pumpkin with fall spices. Topped with whipped cream and pumpkin-pie spices.",
    link: "https://www.starbucks.com/menu/drinks/hot-coffee",
  },
  {
    id: "cold-brew",
    name: "Cold Brew Coffee",
    category: "Drinks",
    subcategory: "Cold Coffee",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74984.jpg",
    description: "Smooth, sweet cold brew steeped for 20 hours, slow-steeped in cool water.",
    link: "https://www.starbucks.com/menu/drinks/cold-coffee",
  },
  {
    id: "matcha-latte",
    name: "Matcha Tea Latte",
    category: "Drinks",
    subcategory: "Matcha",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74981.jpg",
    description: "Smooth and creamy matcha sweetened with liquid cane sugar and prepared with steamed milk.",
    link: "https://www.starbucks.com/menu/drinks/matcha",
  },
  {
    id: "chai-tea-latte",
    name: "Chai Tea Latte",
    category: "Drinks",
    subcategory: "Hot Tea",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74980.jpg",
    description: "Black tea infused with cinnamon, clove, and other warming spices combined with steamed milk.",
    link: "https://www.starbucks.com/menu/drinks/hot-tea",
  },
  {
    id: "iced-peach-green-tea",
    name: "Iced Peach Green Tea",
    category: "Drinks",
    subcategory: "Cold Tea",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74979.jpg",
    description: "Brewed green tea sweetened with liquid cane sugar and mixed with peach juice.",
    link: "https://www.starbucks.com/menu/drinks/cold-tea",
  },
  {
    id: "mango-dragonfruit-refresher",
    name: "Mango Dragonfruit Refresher",
    category: "Drinks",
    subcategory: "Refreshers",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74978.jpg",
    description: "Tropical flavors and real fruit pieces combined with a hint of caffeine from green coffee extract.",
    link: "https://www.starbucks.com/menu/drinks/refreshers",
  },
  {
    id: "strawberry-frappuccino",
    name: "Strawberry Frappuccino® Blended Beverage",
    category: "Drinks",
    subcategory: "Frappuccino® Blended Beverage",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74977.jpg",
    description: "Strawberry sauce and milk blended with ice, layered on top of whipped cream.",
    link: "https://www.starbucks.com/menu/drinks/frappuccino-blended-beverage",
  },
  {
    id: "hot-chocolate",
    name: "Hot Chocolate",
    category: "Drinks",
    subcategory: "Hot Chocolate, Lemonade & More",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74976.jpg",
    description: "Steamed milk with vanilla syrup, mocha sauce, topped with sweetened whipped cream.",
    link: "https://www.starbucks.com/menu/drinks/hot-chocolate-lemonade-more",
  },
  // Food
  {
    id: "bacon-gouda-sandwich",
    name: "Bacon, Gouda & Egg Sandwich",
    category: "Food",
    subcategory: "Breakfast",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74975.jpg",
    description: "Smoked bacon, aged Gouda cheese, and a whole egg on an artisan roll.",
    link: "https://www.starbucks.com/menu/food/breakfast",
  },
  {
    id: "butter-croissant",
    name: "Butter Croissant",
    category: "Food",
    subcategory: "Bakery",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74974.jpg",
    description: "Flaky, buttery, golden-brown croissant baked fresh daily.",
    link: "https://www.starbucks.com/menu/food/bakery",
  },
  {
    id: "chocolate-cake-pop",
    name: "Chocolate Cake Pop",
    category: "Food",
    subcategory: "Treats",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74973.jpg",
    description: "Moist chocolate cake layered with a chocolatey frosting and dipped in a chocolatey coating.",
    link: "https://www.starbucks.com/menu/food/treats",
  },
  {
    id: "turkey-pesto-sandwich",
    name: "Turkey & Pesto Panini",
    category: "Food",
    subcategory: "Lunch",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74972.jpg",
    description: "Turkey, basil pesto, sun-dried tomato spread, and gouda cheese on focaccia.",
    link: "https://www.starbucks.com/menu/food/lunch",
  },
  {
    id: "cheese-crackers",
    name: "Cheese & Fruit Protein Box",
    category: "Food",
    subcategory: "Lite Bites",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74971.jpg",
    description: "White cheddar cheese, grapes, apple slices, and honey roasted peanuts.",
    link: "https://www.starbucks.com/menu/food/lite-bites",
  },
  // At Home Coffee
  {
    id: "pike-place-whole-bean",
    name: "Pike Place® Roast",
    category: "At Home Coffee",
    subcategory: "Whole Bean",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74970.jpg",
    description: "A smooth, well-rounded blend of Latin American coffees with subtle notes of cocoa and praline.",
    link: "https://www.starbucks.com/menu/at-home-coffee/whole-bean",
  },
  {
    id: "via-instant-colombia",
    name: "Starbucks VIA® Colombia",
    category: "At Home Coffee",
    subcategory: "Starbucks VIA® Instant",
    imageUrl: "https://content-prod-live.cert.starbucks.com/binary/v2/asset/137-74969.jpg",
    description: "Medium-roasted Colombian instant coffee with a smooth, balanced flavor.",
    link: "https://www.starbucks.com/menu/at-home-coffee/starbucks-via-instant",
  },
];

const CATEGORIES = ["All", "Drinks", "Food", "At Home Coffee"];
const SUBCATEGORIES: Record<string, string[]> = {
  Drinks: [
    "Cold Coffee", "Hot Coffee", "Matcha", "Hot Tea", "Cold Tea",
    "Refreshers", "Frappuccino® Blended Beverage",
    "Hot Chocolate, Lemonade & More", "Bottled Beverages", "Protein Beverages",
  ],
  Food: ["Breakfast", "Bakery", "Treats", "Lunch", "Lite Bites"],
  "At Home Coffee": ["Whole Bean", "Starbucks VIA® Instant"],
};

// ============================================================================
// MCP Server
// ============================================================================

const mcpServer = new McpServer({
  name: "starbucks-app",
  version: "1.0.0",
});

// Resource: Starbucks Menu Widget
mcpServer.registerResource(
  "starbucks-menu-widget",
  "ui://widget/widget.html",
  {
    title: "Starbucks Menu",
    description: "Browse the full Starbucks menu with drinks, food, and at-home coffee options.",
    mimeType: "text/html+skybridge",
  },
  async () => {
    const widgetMeta: Record<string, unknown> = {
      "openai/widgetDescription": "Starbucks menu browser with categories, item cards, and images.",
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
          uri: "ui://widget/widget.html",
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

// Tool: list_menu_items
mcpServer.registerTool(
  "list_menu_items",
  {
    title: "List Starbucks Menu Items",
    description: "Browse the Starbucks menu. Returns a list of available menu items, optionally filtered by category (Drinks, Food, At Home Coffee) or subcategory.",
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe("Top-level category to filter by: 'Drinks', 'Food', or 'At Home Coffee'. Omit to see all items."),
      subcategory: z
        .string()
        .optional()
        .describe("Subcategory to filter by, e.g. 'Cold Coffee', 'Matcha', 'Breakfast'."),
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/widget.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Loading Starbucks menu...",
      "openai/toolInvocation/invoked": "Menu loaded",
    },
  },
  async ({ category, subcategory }) => {
    let filtered = MENU_ITEMS;
    if (category && category !== "All") {
      filtered = filtered.filter((item) => item.category === category);
    }
    if (subcategory) {
      filtered = filtered.filter((item) =>
        item.subcategory.toLowerCase().includes(subcategory.toLowerCase())
      );
    }

    return {
      structuredContent: {
        menuItems: filtered,
        categories: CATEGORIES,
        subcategories: SUBCATEGORIES,
        activeCategory: category || "All",
        activeSubcategory: subcategory || null,
        totalCount: filtered.length,
      },
      content: [
        {
          type: "text" as const,
          text: `Found ${filtered.length} Starbucks menu items${category ? ` in ${category}` : ""}${subcategory ? ` (${subcategory})` : ""}. The widget displays visual cards with item names, categories, and images.`,
          annotations: { audience: ["assistant"] as ["assistant"] },
        },
      ],
    };
  },
);

// Tool: get_menu_item_details
mcpServer.registerTool(
  "get_menu_item_details",
  {
    title: "Get Menu Item Details",
    description: "Get detailed information about a specific Starbucks menu item by name.",
    inputSchema: {
      itemName: z
        .string()
        .describe("The name of the menu item, e.g. 'Caramel Macchiato' or 'Cold Brew Coffee'."),
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/widget.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Looking up menu item...",
      "openai/toolInvocation/invoked": "Item details loaded",
    },
  },
  async ({ itemName }) => {
    const item = MENU_ITEMS.find((m) =>
      m.name.toLowerCase().includes(itemName.toLowerCase())
    );

    if (!item) {
      return {
        structuredContent: {
          menuItems: MENU_ITEMS,
          categories: CATEGORIES,
          subcategories: SUBCATEGORIES,
          activeCategory: "All",
          activeSubcategory: null,
          totalCount: MENU_ITEMS.length,
          error: `No item found matching "${itemName}". Showing full menu instead.`,
        },
        content: [
          {
            type: "text" as const,
            text: `Could not find a menu item matching "${itemName}". Showing the full menu.`,
            annotations: { audience: ["assistant"] as ["assistant"] },
          },
        ],
      };
    }

    return {
      structuredContent: {
        menuItems: [item],
        categories: CATEGORIES,
        subcategories: SUBCATEGORIES,
        activeCategory: item.category,
        activeSubcategory: item.subcategory,
        totalCount: 1,
        selectedItem: item,
      },
      content: [
        {
          type: "text" as const,
          text: `${item.name} is a ${item.subcategory} item. ${item.description}`,
          annotations: { audience: ["assistant"] as ["assistant"] },
        },
      ],
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
    res.send("Starbucks MCP server is running.");
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
