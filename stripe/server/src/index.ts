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
 * Stripe Pricing MCP Server for ChatGPT Apps.
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
const configuredWidgetCspResourceDomains = parseDomainList(process.env.WIDGET_CSP_RESOURCE_DOMAINS);
const configuredWidgetCspConnectDomains = parseDomainList(process.env.WIDGET_CSP_CONNECT_DOMAINS);

const widgetDistDir = path.resolve(__dirname, "../../web/dist");
const widgetScriptName = "app.js";
const widgetStyleName = "style.css";
const widgetCspResourceDomains = configuredWidgetCspResourceDomains ?? [];
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

// ============================================================================
// Stripe Pricing Data
// ============================================================================

interface StripePlan {
  id: string;
  name: string;
  tagline: string;
  price: string;
  priceSub?: string;
  features: string[];
  cta: string;
  ctaUrl: string;
  highlight?: boolean;
  category: "payments" | "billing" | "platform";
}

interface StripeFee {
  label: string;
  rate: string;
  note?: string;
}

const STRIPE_PLANS: StripePlan[] = [
  {
    id: "standard",
    name: "Standard",
    tagline: "Pay as you go",
    price: "2.9% + 30¢",
    priceSub: "per successful transaction",
    features: [
      "No setup fees, no monthly fees",
      "No hidden fees",
      "Access to complete payments platform",
      "100+ payment methods",
      "Link accelerated checkout",
      "ML-powered fraud prevention",
      "Prebuilt UI components",
      "3D Secure authentication (included)",
      "Adaptive Acceptance (included)",
      "Adaptive Pricing (included)",
      "Global support for 135+ currencies",
      "Online and in-person payments",
    ],
    cta: "Get started",
    ctaUrl: "https://dashboard.stripe.com/register",
    category: "payments",
  },
  {
    id: "custom",
    name: "Custom",
    tagline: "For high-volume businesses",
    price: "Custom pricing",
    features: [
      "Interchange++ (IC+) pricing",
      "Volume discounts",
      "Multi-product discounts",
      "Country-specific rates",
      "Dedicated support",
      "All Standard features included",
      "Custom billing models",
      "Enterprise SLAs",
    ],
    cta: "Contact sales",
    ctaUrl: "https://stripe.com/contact/sales",
    highlight: true,
    category: "payments",
  },
];

const STRIPE_FEES: StripeFee[] = [
  { label: "Domestic cards", rate: "2.9% + 30¢", note: "per successful transaction" },
  { label: "Manually entered cards", rate: "+0.5%" },
  { label: "International cards", rate: "+1.5%" },
  { label: "Currency conversion", rate: "+1%" },
  { label: "Instant Bank Payments (Link)", rate: "2.6% + 30¢" },
  { label: "Klarna", rate: "5.99% + 30¢" },
  { label: "ACH Direct Debit", rate: "0.8%", note: "$5.00 cap" },
  { label: "Stablecoin payments", rate: "1.5%", note: "of transaction amount in USD" },
  { label: "3D Secure authentication", rate: "Included", note: "with Payments (standard)" },
  { label: "Adaptive Acceptance", rate: "Included", note: "with Payments (standard)" },
  { label: "Adaptive Pricing", rate: "Included", note: "with Payments (standard)" },
];

const PLAN_HIGHLIGHTS = [
  {
    id: "payments",
    title: "Online & In-Person Payments",
    description: "Accept payments globally with 100+ methods, optimized checkout, and built-in fraud protection.",
    link: "https://stripe.com/payments",
  },
  {
    id: "billing",
    title: "Subscriptions & Billing",
    description: "Build any billing model—recurring, usage-based, seat-based, or hybrid.",
    link: "https://stripe.com/billing",
  },
  {
    id: "connect",
    title: "Stripe Connect",
    description: "Build marketplaces and platforms with multi-party payments.",
    link: "https://stripe.com/connect",
  },
  {
    id: "radar",
    title: "Radar (Fraud Prevention)",
    description: "ML-powered fraud detection tuned to your business.",
    link: "https://stripe.com/radar",
  },
  {
    id: "terminal",
    title: "Terminal (In-Person)",
    description: "Programmable point-of-sale for unified online and in-person payments.",
    link: "https://stripe.com/terminal",
  },
  {
    id: "sigma",
    title: "Sigma (Analytics)",
    description: "Custom SQL-based reporting on all your Stripe data.",
    link: "https://stripe.com/sigma",
  },
];

// ============================================================================
// MCP Server
// ============================================================================

const mcpServer = new McpServer({
  name: "stripe-pricing",
  version: "1.0.0",
});

const WIDGET_URI = "ui://widget/widget.html";

// ── Widget Resource ──────────────────────────────────────────────────────────

mcpServer.registerResource(
  "stripe-pricing-widget",
  WIDGET_URI,
  {
    title: "Stripe Pricing Widget",
    description: "Interactive pricing table showing Stripe's plans, fees, and features.",
    mimeType: "text/html+skybridge",
  },
  async () => {
    const widgetMeta: Record<string, unknown> = {
      "openai/widgetDescription": "Stripe pricing plans and fees explorer.",
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

// ── Tool: list_plans ─────────────────────────────────────────────────────────

mcpServer.registerTool(
  "list_plans",
  {
    title: "List Stripe Plans",
    description: "Retrieve all available Stripe pricing plans with their features and fees. Use this when a user asks about Stripe pricing, plans, or how much Stripe costs.",
    inputSchema: {
      category: z
        .enum(["payments", "billing", "platform", "all"])
        .optional()
        .describe("Filter plans by category. Defaults to 'all'."),
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Loading Stripe pricing...",
      "openai/toolInvocation/invoked": "Stripe pricing loaded",
    },
  },
  async ({ category }) => {
    const filteredPlans =
      !category || category === "all"
        ? STRIPE_PLANS
        : STRIPE_PLANS.filter((p) => p.category === category);

    return {
      structuredContent: {
        view: "list",
        plans: filteredPlans,
        fees: STRIPE_FEES,
        highlights: PLAN_HIGHLIGHTS,
        sourceUrl: "https://stripe.com/pricing",
      },
      content: [
        {
          type: "text" as const,
          text: `Stripe offers ${filteredPlans.length} plan(s): ${filteredPlans.map((p) => `${p.name} (${p.price})`).join(", ")}. Standard starts at 2.9% + 30¢ per transaction with no setup fees.`,
          annotations: { audience: ["assistant"] as ("assistant")[] },
        },
      ],
    };
  },
);

// ── Tool: compare_plans ──────────────────────────────────────────────────────

mcpServer.registerTool(
  "compare_plans",
  {
    title: "Compare Stripe Plans",
    description: "Compare features and pricing between Stripe's Standard and Custom plans. Use this when a user wants to understand differences between plans.",
    inputSchema: {
      planNames: z
        .array(z.string())
        .describe("Names of plans to compare, e.g. ['Standard', 'Custom']"),
    },
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Comparing plans...",
      "openai/toolInvocation/invoked": "Plan comparison ready",
    },
  },
  async ({ planNames }) => {
    const normalizedNames = planNames.map((n) => n.toLowerCase());
    const selectedPlans = STRIPE_PLANS.filter((p) =>
      normalizedNames.includes(p.id.toLowerCase()) ||
      normalizedNames.includes(p.name.toLowerCase())
    );

    // Fall back to all plans if none matched
    const plansToCompare = selectedPlans.length >= 1 ? selectedPlans : STRIPE_PLANS;

    // Build a feature comparison matrix
    const allFeatureKeys = Array.from(
      new Set(plansToCompare.flatMap((p) => p.features))
    );

    const comparison = plansToCompare.map((plan) => ({
      ...plan,
      featureSet: new Set(plan.features),
    }));

    const matrix = allFeatureKeys.map((feature) => ({
      feature,
      availability: comparison.map((p) => ({
        planId: p.id,
        planName: p.name,
        included: p.featureSet.has(feature),
      })),
    }));

    return {
      structuredContent: {
        view: "compare",
        plans: plansToCompare,
        fees: STRIPE_FEES,
        comparisonMatrix: matrix,
        sourceUrl: "https://stripe.com/pricing",
      },
      content: [
        {
          type: "text" as const,
          text: `Comparing ${plansToCompare.map((p) => p.name).join(" vs ")}: Standard is pay-as-you-go at 2.9% + 30¢ with no monthly fees. Custom offers IC+ pricing, volume discounts, and country-specific rates for high-volume businesses.`,
          annotations: { audience: ["assistant"] as ("assistant")[] },
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
    res.send("Stripe Pricing MCP server is running.");
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
