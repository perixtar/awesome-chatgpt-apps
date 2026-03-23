# Nike ChatGPT App — Plan

## Business Context
Nike e-commerce: sportswear, footwear, and athletic gear for athletes.

## UI Pattern Decisions
- **Display mode**: Inline Card → Fullscreen toggle
- **Pattern**: Carousel (featured collections) + List (search results)
- **Viewer vs editor**: Viewer only (browse + deep-link to nike.com)
- **Empty state**: "Ask me about Nike products" prompt
- **Value beyond plain text**: Visual product cards with images, category chips, and direct shop links

## Widget: `ui://widget/widget.html`
- Shows Nike product/collection cards in a responsive grid/carousel
- Each card: product name, category badge, image (if available), "Shop" CTA
- Filter by category: Running, Basketball, Golf, Football, Lifestyle
- Clicking "Shop" calls `window.openai.openExternal` to nike.com

## Tools
1. **`list_products`** — lists Nike collections/products by optional category
   - Input: `category?: string`
   - Output: `{ products: Product[], category?: string }`
   - Widget: card grid

2. **`search_products_by_name`** — finds Nike products by name
   - Input: `productName: string`
   - Output: `{ products: Product[], query: string }`
   - Widget: same card grid, filtered view

## Product data shape
```ts
interface Product {
  id: string;
  productName: string;
  productUrl: string;
  imageUrl?: string;
  category: string;
  tagline?: string;
}
```

## CSP domains
- `resource_domains`: `https://static.nike.com`
- `connect_domains`: `https://www.nike.com`
