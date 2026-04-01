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
 * Spotify Music Discovery ChatGPT App MCP Server
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

// Spotify album art CDN
const widgetCspResourceDomains = ["https://i.scdn.co"];
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
// Spotify Music Data
// ============================================================================

interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  durationMs: number;
  imageUrl: string;
  spotifyUrl: string;
  previewSnippet: string;
  releaseYear: number;
  popularity: number;
}

const TRACKS: Track[] = [
  // Pop
  {
    id: "blinding-lights",
    name: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    genre: "Pop",
    durationMs: 200040,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    spotifyUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    previewSnippet: "Synthwave-driven anthem with soaring vocals and an infectious 80s-inspired beat.",
    releaseYear: 2020,
    popularity: 95,
  },
  {
    id: "anti-hero",
    name: "Anti-Hero",
    artist: "Taylor Swift",
    album: "Midnights",
    genre: "Pop",
    durationMs: 200690,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae0f5",
    spotifyUrl: "https://open.spotify.com/track/0V3wPSX9ygBnCm8psDIeLu",
    previewSnippet: "Introspective pop track exploring self-doubt with catchy hooks and layered production.",
    releaseYear: 2022,
    popularity: 93,
  },
  {
    id: "flowers",
    name: "Flowers",
    artist: "Miley Cyrus",
    album: "Endless Summer Vacation",
    genre: "Pop",
    durationMs: 200455,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273f429549123dbe8552764ba1d",
    spotifyUrl: "https://open.spotify.com/track/7DSAEUvxU8FajXtRloy8M0",
    previewSnippet: "Empowering self-love anthem with funky disco-pop grooves and soaring chorus.",
    releaseYear: 2023,
    popularity: 91,
  },
  {
    id: "levitating",
    name: "Levitating",
    artist: "Dua Lipa",
    album: "Future Nostalgia",
    genre: "Pop",
    durationMs: 203064,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2734bc66095f8a70bc4e6593f4f",
    spotifyUrl: "https://open.spotify.com/track/39LLxExYz6ewLAo9BXVV8C",
    previewSnippet: "Disco-pop banger with a bouncy bassline and irresistible retro energy.",
    releaseYear: 2020,
    popularity: 90,
  },
  // Hip-Hop / Rap
  {
    id: "not-like-us",
    name: "Not Like Us",
    artist: "Kendrick Lamar",
    album: "Not Like Us (Single)",
    genre: "Hip-Hop",
    durationMs: 274192,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273d3a1748015384c0e38b2459b",
    spotifyUrl: "https://open.spotify.com/track/6AI3ezQ4o3HUoP6Dth1dMq",
    previewSnippet: "Hard-hitting West Coast rap with razor-sharp lyricism over a menacing beat.",
    releaseYear: 2024,
    popularity: 94,
  },
  {
    id: "sicko-mode",
    name: "SICKO MODE",
    artist: "Travis Scott",
    album: "ASTROWORLD",
    genre: "Hip-Hop",
    durationMs: 312820,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273072e9faef2ef7b6db63834a3",
    spotifyUrl: "https://open.spotify.com/track/2xLMifQCjDGFmkHkpNLD9h",
    previewSnippet: "Multi-part psychedelic rap odyssey with beat switches and explosive energy.",
    releaseYear: 2018,
    popularity: 89,
  },
  {
    id: "god-s-plan",
    name: "God's Plan",
    artist: "Drake",
    album: "Scorpion",
    genre: "Hip-Hop",
    durationMs: 198973,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273f907de96b9a4fbc04accc0d5",
    spotifyUrl: "https://open.spotify.com/track/6DCZcSspjsKoFjzjrWoCdn",
    previewSnippet: "Smooth, melodic hip-hop with introspective lyrics about fate and success.",
    releaseYear: 2018,
    popularity: 88,
  },
  {
    id: "money-trees",
    name: "Money Trees",
    artist: "Kendrick Lamar",
    album: "good kid, m.A.A.d city",
    genre: "Hip-Hop",
    durationMs: 386907,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273d28d2ebdedb220e479743797",
    spotifyUrl: "https://open.spotify.com/track/2HbKqm4o0w5wEeEFXm2s4y",
    previewSnippet: "Laid-back West Coast hip-hop storytelling with dreamy Beach House sample.",
    releaseYear: 2012,
    popularity: 87,
  },
  // R&B / Soul
  {
    id: "snooze",
    name: "Snooze",
    artist: "SZA",
    album: "SOS",
    genre: "R&B",
    durationMs: 201800,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2730c471c36970b9406233842a5",
    spotifyUrl: "https://open.spotify.com/track/4iZ4pt7kvcaH6Yo8UoZ4s2",
    previewSnippet: "Dreamy R&B ballad with lush vocals and raw emotional vulnerability.",
    releaseYear: 2022,
    popularity: 90,
  },
  {
    id: "greedy",
    name: "Greedy",
    artist: "Tate McRae",
    album: "THINK LATER",
    genre: "R&B",
    durationMs: 131875,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2730ed6f4e83a48a84e4a2e5f3c",
    spotifyUrl: "https://open.spotify.com/track/3rUGC1vUpkDG9CZFHMur1t",
    previewSnippet: "Sultry dark-pop with driving beats and confident, playful vocal delivery.",
    releaseYear: 2023,
    popularity: 88,
  },
  {
    id: "call-out-my-name",
    name: "Call Out My Name",
    artist: "The Weeknd",
    album: "My Dear Melancholy,",
    genre: "R&B",
    durationMs: 228373,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273c751fce4aa2dd5b8b0c42e69",
    spotifyUrl: "https://open.spotify.com/track/09mEdoA6zrmBPgTEN5qXmN",
    previewSnippet: "Emotionally charged R&B with haunting falsetto and cinematic production.",
    releaseYear: 2018,
    popularity: 86,
  },
  // Rock / Alternative
  {
    id: "heat-waves",
    name: "Heat Waves",
    artist: "Glass Animals",
    album: "Dreamland",
    genre: "Rock",
    durationMs: 238805,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273712701c5e263efc8726b1464",
    spotifyUrl: "https://open.spotify.com/track/02MWAaffLxlfxAUY7c5dvx",
    previewSnippet: "Hazy indie-pop with shimmering synths and a deeply nostalgic chorus.",
    releaseYear: 2020,
    popularity: 89,
  },
  {
    id: "stressed-out",
    name: "Stressed Out",
    artist: "Twenty One Pilots",
    album: "Blurryface",
    genre: "Rock",
    durationMs: 202333,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273de03bfc2919fd4ecef5e7aa5",
    spotifyUrl: "https://open.spotify.com/track/3CRDbSIZ4r5MsZ0YwxuEkn",
    previewSnippet: "Genre-bending alt-rock about adulting anxiety with catchy ukulele riff.",
    releaseYear: 2015,
    popularity: 87,
  },
  {
    id: "under-the-bridge",
    name: "Under the Bridge",
    artist: "Red Hot Chili Peppers",
    album: "Blood Sugar Sex Magik",
    genre: "Rock",
    durationMs: 264306,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273153340370e02963e39b758ee",
    spotifyUrl: "https://open.spotify.com/track/3d9DChrdc6BOeFsbrZ3Is0",
    previewSnippet: "Iconic alt-rock ballad about loneliness and the city of Los Angeles.",
    releaseYear: 1991,
    popularity: 85,
  },
  {
    id: "creep",
    name: "Creep",
    artist: "Radiohead",
    album: "Pablo Honey",
    genre: "Rock",
    durationMs: 236000,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273df55e326ed144ab4f5cecf95",
    spotifyUrl: "https://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx3r",
    previewSnippet: "Grunge-era anthem of alienation with quiet-loud dynamics and raw emotion.",
    releaseYear: 1993,
    popularity: 84,
  },
  // Electronic / Dance
  {
    id: "one-more-time",
    name: "One More Time",
    artist: "Daft Punk",
    album: "Discovery",
    genre: "Electronic",
    durationMs: 320357,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2732e4085944389e tried816dcf859",
    spotifyUrl: "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV",
    previewSnippet: "Euphoric French house classic with chopped vocal samples and infectious groove.",
    releaseYear: 2001,
    popularity: 86,
  },
  {
    id: "titanium",
    name: "Titanium",
    artist: "David Guetta ft. Sia",
    album: "Nothing but the Beat",
    genre: "Electronic",
    durationMs: 245040,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273d237f9c9af78dc900e498b94",
    spotifyUrl: "https://open.spotify.com/track/0lHAMNU8RGiIObRLeEzdLV",
    previewSnippet: "Powerful EDM anthem with Sia's soaring vocals over driving electro-house beats.",
    releaseYear: 2011,
    popularity: 85,
  },
  {
    id: "midnight-city",
    name: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    genre: "Electronic",
    durationMs: 243817,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2730b3075f0be97d12e98e932c3",
    spotifyUrl: "https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIIb",
    previewSnippet: "Cinematic synth-pop with soaring sax solo and shimmering dream-pop textures.",
    releaseYear: 2011,
    popularity: 84,
  },
  // Latin
  {
    id: "despacito",
    name: "Despacito",
    artist: "Luis Fonsi ft. Daddy Yankee",
    album: "Vida",
    genre: "Latin",
    durationMs: 228307,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b273ef0d4234e1a645740f77d59c",
    spotifyUrl: "https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb",
    previewSnippet: "Global reggaeton smash with irresistible Latin guitar riff and catchy hook.",
    releaseYear: 2017,
    popularity: 88,
  },
  {
    id: "dakiti",
    name: "Dakiti",
    artist: "Bad Bunny & Jhay Cortez",
    album: "EL ÚLTIMO TOUR DEL MUNDO",
    genre: "Latin",
    durationMs: 205090,
    imageUrl: "https://i.scdn.co/image/ab67616d0000b2731ee1f955e894e5e4b2342077",
    spotifyUrl: "https://open.spotify.com/track/4MzXwWMhyBbmu6hOcLVD49",
    previewSnippet: "Dreamy reggaeton with ethereal synths and Bad Bunny's signature melodic flow.",
    releaseYear: 2020,
    popularity: 86,
  },
];

const GENRES = ["All", "Pop", "Hip-Hop", "R&B", "Rock", "Electronic", "Latin"];

// ============================================================================
// MCP Server
// ============================================================================

const mcpServer = new McpServer({
  name: "spotify-app",
  version: "1.0.0",
});

// Resource: Spotify Widget
mcpServer.registerResource(
  "spotify-widget",
  "ui://widget/widget.html",
  {
    title: "Spotify Music Discovery",
    description: "Browse top tracks across genres with album art, artist details, and Spotify deep-links.",
    mimeType: "text/html+skybridge",
  },
  async () => {
    const widgetMeta: Record<string, unknown> = {
      "openai/widgetDescription": "Spotify music discovery browser with genre filters, track cards, and album art.",
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

// Tool: list_tracks
mcpServer.registerTool(
  "list_tracks",
  {
    title: "List Spotify Tracks",
    description: "Browse popular tracks. Returns a list of tracks optionally filtered by genre (Pop, Hip-Hop, R&B, Rock, Electronic, Latin).",
    inputSchema: {
      genre: z
        .string()
        .optional()
        .describe("Genre to filter by: 'Pop', 'Hip-Hop', 'R&B', 'Rock', 'Electronic', or 'Latin'. Omit to see all tracks."),
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/widget.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Loading tracks...",
      "openai/toolInvocation/invoked": "Tracks loaded",
    },
  },
  async ({ genre }) => {
    let filtered = TRACKS;
    if (genre && genre !== "All") {
      filtered = filtered.filter((t) => t.genre === genre);
    }
    // Sort by popularity descending
    filtered = [...filtered].sort((a, b) => b.popularity - a.popularity);

    return {
      structuredContent: {
        tracks: filtered,
        genres: GENRES,
        activeGenre: genre || "All",
        totalCount: filtered.length,
      },
      content: [
        {
          type: "text" as const,
          text: `Found ${filtered.length} tracks${genre ? ` in ${genre}` : ""}. The widget shows album art cards with artist names, genres, and Spotify links.`,
          annotations: { audience: ["assistant"] as ["assistant"] },
        },
      ],
    };
  },
);

// Tool: get_track_details
mcpServer.registerTool(
  "get_track_details",
  {
    title: "Get Track Details",
    description: "Get detailed information about a specific track by name or artist.",
    inputSchema: {
      query: z
        .string()
        .describe("Track name or artist name to search for, e.g. 'Blinding Lights' or 'Kendrick Lamar'."),
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/widget.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Looking up track...",
      "openai/toolInvocation/invoked": "Track details loaded",
    },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const matches = TRACKS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q),
    );

    if (matches.length === 0) {
      return {
        structuredContent: {
          tracks: TRACKS,
          genres: GENRES,
          activeGenre: "All",
          totalCount: TRACKS.length,
          error: `No tracks found matching "${query}". Showing all tracks instead.`,
        },
        content: [
          {
            type: "text" as const,
            text: `Could not find a track matching "${query}". Showing all tracks.`,
            annotations: { audience: ["assistant"] as ["assistant"] },
          },
        ],
      };
    }

    const selectedTrack = matches[0];

    return {
      structuredContent: {
        tracks: matches,
        genres: GENRES,
        activeGenre: selectedTrack.genre,
        totalCount: matches.length,
        selectedTrack,
      },
      content: [
        {
          type: "text" as const,
          text: `${selectedTrack.name} by ${selectedTrack.artist} — ${selectedTrack.previewSnippet}`,
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
    res.send("Spotify MCP server is running.");
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
