# Spotify Music Discovery — Plan

## Business Goal

Let users discover and browse popular tracks inside ChatGPT. They can filter by
genre (Pop, Hip-Hop, R&B, Rock, Electronic, Latin), view track details with album
art and descriptions, and deep-link to Spotify to listen.

## UI Pattern

**Ranked List + Detail** — a numbered track list with row cards and an expanded detail view.

- Default view: compact row cards showing rank, album art thumbnail, track name, artist, genre badge, and duration.
- Detail view: large album art, full metadata (album, year, duration), description snippet, and action buttons.
- Genre filter chips at the top for quick filtering.

## MCP Tools

| Tool | Args | Returns |
|------|------|---------|
| `list_tracks` | `genre?: string` | Array of track summary objects sorted by popularity |
| `get_track_details` | `query: string` | Matching track(s) with full metadata |

## Widget States

| State key | Type | Purpose |
|-----------|------|---------|
| `localGenre` | `string \| null` | Active genre filter chip |
| `selectedTrack` | `Track \| null` | Which track is shown in detail |

## Data

All track data is hardcoded in the server (no Spotify API key needed). Covers 20
popular tracks across 6 genres: Pop, Hip-Hop, R&B, Rock, Electronic, and Latin.

## CSP

Album art is served from Spotify's image CDN, so `widgetCspResourceDomains`
includes `https://i.scdn.co`.
