# Starbucks ChatGPT App — Plan

## Business Context
- **Site**: https://starbucks.com
- **Type**: Coffee shop / restaurant
- **Goal**: Let users discover and explore the Starbucks menu inside ChatGPT

## Primary Entity: MenuItem
Fields: name, category, imageUrl, description, link

## Tools
1. `list_menu_items` — returns menu items optionally filtered by category
   - Input: `category` (optional string)
   - Output: array of menuItems with structuredContent

2. `get_menu_item_details` — detailed info about a specific item
   - Input: `itemName` (required string)
   - Output: name, category, imageUrl, description, link

## Resource
- URI: `ui://widget/widget.html`
- mimeType: `text/html+skybridge`
- Inline widget delivery via readWidgetAsset()

## UI Pattern
- **Pattern**: Card Grid (category list → item cards)
- **Display mode**: Inline Card, expand to fullscreen
- **Viewer**: Yes (read-only)
- **Empty state**: Prompt to ask about the menu
- **Value beyond text**: Visual menu browsing with images, category filter tabs

## Widget Layout
1. Header: Starbucks logo + title + expand button
2. Category filter tabs (All, Drinks, Food, At Home)
3. Item cards grid: image + name + category badge
4. Footer: "Order at Starbucks" link

## Data
Static menu data embedded in server from website analysis.
Categories: Trending, Hot Coffee, Cold Coffee, Matcha, Hot Tea, Cold Tea,
Refreshers, Frappuccino® Blended Beverage, Hot Chocolate/Lemonade & More,
Bottled Beverages, Breakfast, Bakery, Treats, Lunch, Lite Bites,
Whole Bean, Starbucks VIA® Instant

## CSP
- resource_domains: https://content-prod-live.cert.starbucks.com
- connect_domains: (none needed — data is static)
