# Awesome ChatGPT Apps [![Awesome](https://awesome.re/badge.svg)](https://awesome.re) [![Apps](https://img.shields.io/badge/apps-6-blue.svg)](https://github.com/perixtar/awesome-chatgpt-apps) [![Last Commit](https://img.shields.io/github/last-commit/perixtar/awesome-chatgpt-apps)](https://github.com/perixtar/awesome-chatgpt-apps/commits/main)

> A curated collection of self-contained ChatGPT Apps generated with a Fly.io sandbox runner, cleaned up and organized into reusable example projects.

Each project combines an MCP-style server with a web widget experience and focuses on a specific product surface such as listings discovery, menu browsing, product search, or pricing exploration.

## Contents

- [Why This Repo](#why-this-repo)
- [Collection](#collection)
- [Quick Start](#quick-start)
- [Repository Layout](#repository-layout)
- [Notes](#notes)
- [Snapshot Provenance](#snapshot-provenance)

## Why This Repo

- Keeps only one latest app per brand instead of every intermediate generation.
- Preserves source code only, so the repo stays lightweight and easy to inspect.
- Makes common ChatGPT App patterns easier to compare across multiple domains.
- Provides a clean starting point for forking, remixing, or studying MCP-backed widget apps.

## Collection

| App | Folder | Experience | Source | State |
| --- | --- | --- | --- | --- |
| Airbnb Listings Browser | [`airbnb/`](./airbnb) | Search listings, browse cards, inspect details, and deep-link to Airbnb | [airbnb.com](https://airbnb.com) | Latest source snapshot |
| Cats Article Explorer | [`cats/`](./cats) | Browse and search cat-care articles in a card-grid interface | [cats.com](https://cats.com) | Latest source snapshot |
| Nike Product Browser | [`nike/`](./nike) | Explore products and collections with category filters and search | [nike.com](https://nike.com) | Ready snapshot |
| Spotify Music Discovery | [`spotify/`](./spotify) | Browse popular tracks by genre, view details, and deep-link to Spotify | [spotify.com](https://spotify.com) | Ready snapshot |
| Starbucks Menu Browser | [`starbucks/`](./starbucks) | Discover drinks and food items with category-based browsing | [starbucks.com](https://starbucks.com) | Ready snapshot |
| Stripe Pricing Explorer | [`stripe/`](./stripe) | Compare pricing plans, fees, and product highlights | [stripe.com](https://stripe.com) | Ready snapshot |

## Quick Start

Clone the repo, choose an app folder, install dependencies, and run it locally:

```bash
git clone https://github.com/perixtar/awesome-chatgpt-apps.git
cd awesome-chatgpt-apps/starbucks
npm install
npm run build
npm run start
```

Every app currently exposes the same core scripts:

- `npm run dev` for local development
- `npm run build` to build the server and widget bundle
- `npm run start` to run the built app
- `npm test` to run the test suite

## Repository Layout

```text
awesome-chatgpt-apps/
├── airbnb/
├── cats/
├── nike/
├── spotify/
├── starbucks/
├── stripe/
└── README.md
```

Each top-level folder is a standalone ChatGPT App snapshot with its own `package.json`, server code, widget code, and supporting configuration.

## Notes

- These apps were generated from a Fly.io sandbox-runner workflow and then curated manually.
- Excluded from this repo: `node_modules`, `dist/`, `web/dist/`, `.agent`, `.claude`, and `.claude-runtime`.
- Some apps were copied while still in a generation state, so this repository should be treated as a source collection rather than a guarantee that every preview is deploy-ready.
- Brand names, content, and trademarks belong to their respective owners.

## Snapshot Provenance

<details>
<summary>Internal snapshot details for the curated copies</summary>

| Folder | Kept Variant | Project ID | Source URL | Created (UTC) | State At Copy Time |
| --- | --- | --- | --- | --- | --- |
| `airbnb/` | `airbnb-listings-browser-v3-c8e4b302` | `c8e4b302-bd95-40da-986c-08649627d526` | `https://airbnb.com` | `2026-03-19T03:43:31Z` | `generating` |
| `cats/` | `cats-article-explorer-da0eb966` | `da0eb966-7106-4bd7-afdb-a20e9cdc66fe` | `https://cats.com/` | `2026-03-19T03:24:55Z` | `generating` |
| `nike/` | `nike-product-browser-281d9e3b` | `281d9e3b-c323-4bba-9d53-7b36c9f47785` | `https://nike.com` | `2026-03-16T00:43:32Z` | `ready` |
| `starbucks/` | `starbucks-menu-browser-v3-6dfb6a4f` | `6dfb6a4f-82b7-4950-8588-1b3fb23dfef6` | `https://starbucks.com` | `2026-03-18T06:00:28Z` | `ready` |
| `stripe/` | `stripe-pricing-explorer-ce4f428a` | `ce4f428a-f3e3-4bfe-8044-1cbc042f46df` | `https://stripe.com` | `2026-03-18T05:04:32Z` | `ready` |

</details>
