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
 * Airbnb ChatGPT App — MCP Server
 *
 * Tools:
 *   - list_available_listings: search by location / dates
 *   - get_listing_details: full detail for a single listing
 *
 * Widget asset delivery is inline-only:
 *   - read built files from web/dist via readWidgetAsset()
 *   - embed CSS/JS directly into the widget HTML
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

// Allow Airbnb's image CDN by default; merge with any env-configured domains
const defaultCspResourceDomains = ["https://a0.muscache.com"];
const widgetCspResourceDomains = configuredWidgetCspResourceDomains
  ? [...new Set([...defaultCspResourceDomains, ...configuredWidgetCspResourceDomains])]
  : defaultCspResourceDomains;
const widgetCspConnectDomains = configuredWidgetCspConnectDomains ?? [];

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

// ─── Mock Data ──────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  title: string;
  price: string;
  pricePerNight: number;
  description: string;
  imageUrl: string;
  location: string;
  rating: number;
  reviewCount: number;
  amenities: string[];
  url: string;
}

const MOCK_LISTINGS: Listing[] = [
  {
    id: "listing-001",
    title: "Charming Montmartre Apartment",
    price: "$142/night",
    pricePerNight: 142,
    description:
      "Nestled in the heart of Montmartre, this bright apartment offers stunning views of Paris rooftops. Steps from the Sacré-Cœur and local cafés. Perfect for couples or solo travelers seeking an authentic Parisian experience.",
    imageUrl:
      "https://a0.muscache.com/im/pictures/miso/Hosting-51809333/original/0da70267-d9da-4efb-9123-2714b651c9c3.jpeg",
    location: "Paris, France",
    rating: 4.89,
    reviewCount: 214,
    amenities: ["WiFi", "Kitchen", "Washer", "Air conditioning"],
    url: "https://www.airbnb.com/rooms/51809333",
  },
  {
    id: "listing-002",
    title: "Modern Loft in Le Marais",
    price: "$198/night",
    pricePerNight: 198,
    description:
      "Stylish industrial loft in the vibrant Le Marais district. High ceilings, exposed brick, and designer furnishings. Walking distance to the best restaurants, galleries, and boutiques in Paris.",
    imageUrl:
      "https://a0.muscache.com/im/pictures/miso/Hosting-717134404264905813/original/bbc3e4bf-0a17-4a8a-b893-7b26a6e80db8.jpeg",
    location: "Paris, France",
    rating: 4.95,
    reviewCount: 87,
    amenities: ["WiFi", "Kitchen", "Gym", "Concierge"],
    url: "https://www.airbnb.com/rooms/717134404264905813",
  },
  {
    id: "listing-003",
    title: "Cozy Studio near Eiffel Tower",
    price: "$89/night",
    pricePerNight: 89,
    description:
      "Affordable and comfortable studio a short walk from the Eiffel Tower. Great base for exploring Paris on a budget. Fully equipped kitchen and fast WiFi included.",
    imageUrl:
      "https://a0.muscache.com/im/pictures/miso/Hosting-51809333/original/0da70267-d9da-4efb-9123-2714b651c9c3.jpeg",
    location: "Paris, France",
    rating: 4.72,
    reviewCount: 341,
    amenities: ["WiFi", "Kitchen", "TV"],
    url: "https://www.airbnb.com/rooms/12345678",
  },
  {
    id: "listing-004",
    title: "Luxury Suite with Seine Views",
    price: "$375/night",
    pricePerNight: 375,
    description:
      "Experience Paris in ultimate luxury. This stunning suite features floor-to-ceiling windows with breathtaking Seine river views, a private terrace, and premium amenities. Perfect for a special occasion.",
    imageUrl:
      "https://a0.muscache.com/im/pictures/miso/Hosting-717134404264905813/original/bbc3e4bf-0a17-4a8a-b893-7b26a6e80db8.jpeg",
    location: "Paris, France",
    rating: 4.98,
    reviewCount: 52,
    amenities: ["WiFi", "Kitchen", "Pool", "Concierge", "Terrace", "Parking"],
    url: "https://www.airbnb.com/rooms/87654321",
  },
  {
    id: "listing-005",
    title: "Artist's Retreat in Saint-Germain",
    price: "$165/night",
    pricePerNight: 165,
    description:
      "Stay where Hemingway and Picasso once roamed. This charming apartment in Saint-Germain-des-Prés blends bohemian character with modern comfort. Original hardwood floors, art-filled walls, and a cozy reading nook.",
    imageUrl:
      "https://a0.muscache.com/im/pictures/miso/Hosting-51809333/original/0da70267-d9da-4efb-9123-2714b651c9c3.jpeg",
    location: "Paris, France",
    rating: 4.84,
    reviewCount: 163,
    amenities: ["WiFi", "Kitchen", "Washer", "Books & library"],
    url: "https://www.airbnb.com/rooms/11223344",
  },
  {
    id: "listing-006",
    title: "Penthouse with Rooftop Terrace",
    price: "$280/night",
    pricePerNight: 280,
    description:
      "Stunning penthouse apartment with a private rooftop terrace offering 360° views of Paris. Perfect for groups or families. Modern design with a fully-equipped gourmet kitchen and smart home features.",
    imageUrl:
      "https://a0.muscache.com/im/pictures/miso/Hosting-717134404264905813/original/bbc3e4bf-0a17-4a8a-b893-7b26a6e80db8.jpeg",
    location: "Paris, France",
    rating: 4.91,
    reviewCount: 78,
    amenities: ["WiFi", "Kitchen", "Terrace", "BBQ grill", "Smart TV", "Parking"],
    url: "https://www.airbnb.com/rooms/55667788",
  },
];

function getListingsForLocation(location: string): Listing[] {
  // In a real app this would query an API. Return mock data with location overridden.
  return MOCK_LISTINGS.map((l) => ({
    ...l,
    location: location || l.location,
  }));
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const mcpServer = new McpServer({
  name: "airbnb-chatgpt-app",
  version: "1.0.0",
});

// Widget resource
mcpServer.registerResource(
  "airbnb-listings-widget",
  "ui://airbnb/listings.html",
  {
    title: "Airbnb Listings Widget",
    description:
      "Interactive carousel widget showing available Airbnb listings with pricing, ratings, and details.",
    mimeType: "text/html+skybridge",
  },
  async () => {
    const widgetMeta: Record<string, unknown> = {
      "openai/widgetDescription": "Browse Airbnb listings with pricing and details.",
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
          uri: "ui://airbnb/listings.html",
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

// Tool: list_available_listings
mcpServer.registerTool(
  "list_available_listings",
  {
    title: "Find Airbnb Listings",
    description:
      "Search for available Airbnb accommodations by location and optional date range. Returns a visual carousel of listings with prices, ratings, and photos.",
    inputSchema: {
      location: z
        .string()
        .describe('Destination city or area (e.g. "Paris, France", "Malibu, CA")'),
      dateRange: z
        .string()
        .optional()
        .describe('Check-in and check-out dates (e.g. "June 10–15, 2025")'),
      guests: z
        .number()
        .optional()
        .describe("Number of guests"),
    },
    _meta: {
      "openai/outputTemplate": "ui://airbnb/listings.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Searching for listings...",
      "openai/toolInvocation/invoked": "Listings ready",
      ui: { resourceUri: "ui://airbnb/listings.html" },
    },
  },
  async ({ location, dateRange, guests }) => {
    const listings = getListingsForLocation(location);

    const summary = `Found ${listings.length} available listing${listings.length !== 1 ? "s" : ""} in ${location}${dateRange ? ` for ${dateRange}` : ""}${guests ? ` · ${guests} guest${guests !== 1 ? "s" : ""}` : ""}.`;

    return {
      structuredContent: {
        listings,
        location,
        dateRange: dateRange ?? null,
        guests: guests ?? null,
        summary,
      },
      content: [
        {
          type: "text" as const,
          text: summary,
          annotations: { audience: ["assistant"] as const },
        },
      ],
      _meta: {},
    };
  },
);

// Tool: get_listing_details
mcpServer.registerTool(
  "get_listing_details",
  {
    title: "Get Listing Details",
    description:
      "Retrieve full details for a specific Airbnb listing including description, amenities, pricing breakdown, and photos.",
    inputSchema: {
      listingId: z
        .string()
        .describe('The listing ID (e.g. "listing-001")'),
    },
    _meta: {
      "openai/outputTemplate": "ui://airbnb/listings.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Loading listing details...",
      "openai/toolInvocation/invoked": "Listing details ready",
      ui: { resourceUri: "ui://airbnb/listings.html" },
    },
  },
  async ({ listingId }) => {
    const listing = MOCK_LISTINGS.find((l) => l.id === listingId);

    if (!listing) {
      return {
        structuredContent: { error: `Listing "${listingId}" not found.`, listing: null },
        content: [
          {
            type: "text" as const,
            text: `Listing "${listingId}" was not found.`,
            annotations: { audience: ["assistant"] as const },
          },
        ],
        _meta: {},
      };
    }

    return {
      structuredContent: {
        listing,
        viewMode: "detail",
      },
      content: [
        {
          type: "text" as const,
          text: `${listing.title} — ${listing.price} · ★${listing.rating} (${listing.reviewCount} reviews) · ${listing.location}`,
          annotations: { audience: ["assistant"] as const },
        },
      ],
      _meta: {},
    };
  },
);

// ─── Transport ───────────────────────────────────────────────────────────────

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
    res.send("Airbnb ChatGPT App MCP server is running.");
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
