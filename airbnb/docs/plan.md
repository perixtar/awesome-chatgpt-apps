# Airbnb ChatGPT App — Plan

## App Spec

**Users:** Travelers searching accommodations via ChatGPT.
**Goals:** Discover listings by location/dates, view pricing, get listing details, open on Airbnb.
**Non-goals:** Real booking flow, payment, account management.

---

## Architecture

### Task → Interaction Matrix

| User Task | Mode | Tool/Widget |
|-----------|------|-------------|
| Discover listings | Tool + Widget | `list_available_listings` → carousel widget |
| View listing details | Tool + Widget | `get_listing_details` → detail card in widget |
| Pricing inquiry | Chat | `list_available_listings` with price in output |
| Help / support | Chat | link to airbnb.com/help resource |

### UI Patterns

- **Widget:** Inline Carousel (3–6 listing cards, image + title + price)
- **Display mode:** Inline (compact) with fullscreen expansion for full grid
- **Empty state:** "No listings found" with follow-up prompt button
- **Loading state:** Skeleton cards
- **Error state:** Error badge + retry button

### Entities & State

```ts
interface Listing {
  id: string;
  title: string;
  price: string;          // e.g. "$150/night"
  description?: string;
  imageUrl?: string;
  location: string;
  rating?: number;        // 0–5
  reviewCount?: number;
}
```

Widget state: `{ selectedListingId: string | null }`

### Tools

**`list_available_listings`**
- Input: `location` (string, required), `dateRange` (string, optional), `guests` (number, optional)
- Output: `structuredContent: { listings: Listing[], location: string, dateRange?: string }`
- Widget: carousel of listing cards
- Mock: 6 realistic sample listings

**`get_listing_details`**
- Input: `listingId` (string, required)
- Output: `structuredContent: { listing: Listing }`
- Widget: reuses same widget — sets `selectedListingId` to show detail view
- Mock: detailed listing from the sample set

### Widgets

**Single widget:** `ui://airbnb/listings.html`
- Carousel mode: shows all listings as scrollable cards
- Detail mode: when `selectedListingId` is set, shows full detail card
- Both modes inline, with fullscreen expansion for the grid

**CSP:** `resource_domains: ["https://a0.muscache.com"]` (Airbnb CDN for images), fallback to placeholder if image fails.

### Bootstrap Plan

1. Write `docs/plan.md` ✓
2. Implement `server/src/index.ts` (2 tools + 1 resource, mock data)
3. Implement `web/src/component.tsx` (carousel widget)
4. `npm run build` → fix errors
5. Summarize

---

## UI Design

**Inline card layout:**
```
┌─────────────────────────────────────────┐
│ 📍 Paris · Jun 10–15  [Expand] [Ask]   │
├──────────┬──────────┬──────────┬────────┤
│ [img]    │ [img]    │ [img]    │  ›    │
│ Title    │ Title    │ Title    │       │
│ ★4.8 (42)│ ★4.9 (18)│ ★4.7 (90)│       │
│ $120/nt  │ $85/nt   │ $200/nt  │       │
│ [View →] │ [View →] │ [View →] │       │
└──────────┴──────────┴──────────┴────────┘
```

**Detail view (when a listing is selected):**
```
┌─────────────────────────────────┐
│ [← Back]                        │
│ [Large image]                   │
│ Title              ★4.8 · 42 rev│
│ 📍 Location                     │
│ $150/night · 5 nights = $750   │
│ Description...                  │
│ [Book on Airbnb ↗]             │
└─────────────────────────────────┘
```
