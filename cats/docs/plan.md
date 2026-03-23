# cats.com Article Explorer — Implementation Plan

## App Spec

- **Users**: Cat owners seeking reliable cat care information and product recommendations
- **Goals**: Discover and search cat care articles from cats.com via an interactive card grid
- **Non-goals**: No CMS editing, no user accounts, no article authoring, no comment system

---

## Architecture

MCP server with 2 tools + 1 widget resource

```
MCP Server (server/src/index.ts)
├── Tool: list_articles(category?) → Article[]   → widget
├── Tool: search_articles(query)  → Article[]   → widget
└── Resource: https://cats.com/articles          → widget HTML
```

Data layer: embedded JSON dataset (no external API required at launch).

### Task → Interaction Matrix

| User Task                        | Mode              |
|----------------------------------|-------------------|
| Browse articles by category      | tool → widget     |
| Search articles by keyword       | tool → widget     |
| Get article details / read more  | chat (link to cats.com) |

### UI Patterns

- **Display mode**: Inline Card (default) → Fullscreen for expanded view
- **Pattern**: Card Grid — 2 columns on desktop, 1 column on mobile
- **Each card**:
  - Thumbnail image (graceful fallback placeholder if `imageUrl` absent)
  - Category badge (colored pill)
  - Article title (bold)
  - Author name
  - "Read More" link opening cats.com in a new tab
- **Empty state**: "No articles found. Try a different search or category."
- **Loading state**: Skeleton cards (pulsing placeholder blocks)
- **Error state**: "Unable to load articles. Please try again."

### Entities & State

```ts
interface Article {
  title: string;
  author: string;
  category: string;
  url: string;
  imageUrl?: string;
}

// Widget props (passed via tool result JSON)
interface WidgetProps {
  articles: Article[];
  query?: string;      // present when called from search_articles
  category?: string;   // present when called from list_articles with filter
}
```

### Tools

1. **`list_articles(category?: string) → Article[]`**
   - Optional `category` filter; returns all articles when omitted
   - Filters embedded dataset by exact category match (case-insensitive)
   - `_meta["openai/outputTemplate"]` = `"https://cats.com/articles"`
   - Returns `WidgetProps` shape: `{ articles, category }`

2. **`search_articles(query: string) → Article[]`**
   - Required `query` string
   - Filters articles by substring match on `title` and `category` (case-insensitive)
   - `_meta["openai/outputTemplate"]` = `"https://cats.com/articles"`
   - Returns `WidgetProps` shape: `{ articles, query }`

Both tools use Zod for `inputSchema` (not raw JSON Schema).

### Widgets

- **Resource URI**: `https://cats.com/articles`
- **mimeType**: `text/html+skybridge`
- **Delivery**: Inline-only via `readWidgetAsset()` — no external asset URLs
- **Single widget** handles both list and search results via the `articles` prop array
- **CSP resource_domains**: `["cats.com"]` to allow article thumbnail images
- Widget reads props from `window.openai` SDK and renders the card grid

### Bootstrap Plan

1. Scaffold `server/src/index.ts` with MCP boilerplate and transport handling
2. Define embedded article dataset (JSON array, ~20 articles across categories: health, behavior, products, nutrition)
3. Implement `list_articles` tool with optional category filter
4. Implement `search_articles` tool with title/category substring match
5. Register `https://cats.com/articles` resource with `text/html+skybridge` mimeType and metadata
6. Build widget HTML/CSS/JS inline (card grid, skeleton loader, empty/error states)
7. Wire `openai/outputTemplate` metadata on both tools pointing to widget URI
8. Embed widget via `readWidgetAsset()` in resource read handler
9. Run `npm run build` — fix any TypeScript or bundler errors before shipping

---

## UI Design

- **Brand accent**: Warm orange `#FF6B35`
- **Background**: White `#FFFFFF` / light gray `#F8F8F8` card backgrounds
- **Favicon**: Cat paw emoji 🐾
- **Card style**: Rounded corners (`border-radius: 12px`), subtle box shadow, hover lift effect (`transform: translateY(-2px)`)
- **Category badge colors**:
  - Health → orange `#FF6B35`
  - Behavior → blue `#4A90D9`
  - Products → green `#5BAD6F`
  - Nutrition → purple `#9B59B6`
  - Default → gray `#888888`
- **Typography**: Clean sans-serif (system font stack), article titles bold `font-weight: 700`
- **Grid**: `display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px` — collapses to `1fr` below 600px
- **Thumbnail**: Fixed height `180px`, `object-fit: cover`, fallback gray placeholder with paw icon
- **Read More link**: Orange underline, opens `target="_blank" rel="noopener noreferrer"`
