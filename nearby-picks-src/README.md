# Nearby Picks

A mobile-first map of well-reviewed **trails** and **food** near a home point.
Pin **color = distance band** from home (0–5, 5–10, 10–15, 15+ mi); pin **shape = tier**.

Stack: Vite + React + TypeScript, MapLibre GL JS on OpenStreetMap vector tiles (OpenFreeMap, no key),
plain CSS with light/dark tokens, `vite-plugin-pwa`. No backend.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into ../nearby-picks/
npm run preview    # serve the build (service worker is active here, not in dev)
npm test           # scoring unit tests (node:test)
```

## What's here

| Feature | Where |
| --- | --- |
| Home point (default Gresham, OR): search (OSM Nominatim), tap map, drag the house pin, or use GPS; saved in localStorage | `src/components/HomeControl.tsx`, `src/App.tsx` |
| Pin encoding + legend | `src/lib/encoding.ts`, `src/components/MapView.tsx`, `src/components/Legend.tsx` |
| Filters (category, tier, distance band, text) with faceted counts on every chip | `src/lib/filters.ts`, `src/components/FilterBar.tsx` |
| Detail card (distance, rating, reviews, notes, Google Maps link, Save/Visited) | `src/components/DetailCard.tsx` |
| List grouped by tier, sorted by distance, synced with map selection | `src/components/ListView.tsx` |
| Saved / Visited (localStorage) | `src/lib/storage.ts` |
| PWA: installable; app shell, spot data and map worker precached; viewed map tiles cached at runtime | `vite.config.ts` |

Distances are straight-line (haversine). Drive time is a later phase.

## Data

`src/data/spots.json` is the only data the app reads. The committed seed has 10 trails + 10 food spots
with **approximate coordinates and placeholder ratings/review counts** — run the fetch script to replace them.

### Refreshing from Google Places

```bash
cp .env.example .env          # add GOOGLE_PLACES_API_KEY (git-ignored)
npm run fetch-spots -- --dry-run
npm run fetch-spots
```

`scripts/fetch-spots.mjs` runs only in Node. The key is never prefixed `VITE_`, so Vite cannot expose it to client code.

- **Areas:** `data/sources.json` → `areas[]`. Each has an id, label, center, radius and a few `towns`. Food and
  trail searches are templates (`"best restaurants in {town}"`) run for every town, so adding a region is one entry.
  `npm run fetch-spots -- --area <id>` refreshes one area and leaves the rest alone. The app reads the area list
  from `src/data/areas.json` and tells the user when their home point is outside every area.
- **Food score** = Bayesian-adjusted rating `(v/(v+m))·R + (m/(v+m))·C`, where `C` is the review-weighted mean of
  all candidates (shared across areas, so tiers mean the same everywhere) and `m` = `food.priorWeight`, plus
  `bonusPerList` for each list in `data/press-picks.json` the place appears on (capped at `maxBonus`). Tier comes
  from `food.tierThresholds`; anything below "good" is dropped, except hand-picked `food.include` entries.
  Up to `food.maxSpotsPerArea` per area.
- **Trails** only appear once they have a manual `difficulty` in `trails[]`. Trails found by search that aren't
  rated yet go to `data/trail-candidates.json`: set `difficulty`, move the entry into `trails[]`, and re-run.
- Permanently closed places, places outside their area's radius, and food below `minReviews` are skipped.
  Ids, notes and tags carry over between runs (matched by place id).
- Cost: roughly 30–50 Text Search requests per area per run (the script prints the count).
- Offline test run with fake places, no key: `npm run fetch-spots:fixture`.

Note: Google Maps Platform terms limit how long Places content (ratings, review counts, coordinates) may be
stored; place IDs may be kept indefinitely. Check the current terms before publishing a long-lived snapshot.

## Map tiles

Basemaps default to OpenFreeMap `positron` (light) and `dark`. Override with `VITE_MAP_STYLE_LIGHT` /
`VITE_MAP_STYLE_DARK`. If the vector style fails to load, the app falls back to raster OSM tiles.

## Deploying on GitHub Pages

Live at https://tualal.github.io/nearby-picks/. This folder (`nearby-picks-src/`) is the source; `npm run build`
writes the static app to `../nearby-picks/`, which GitHub Pages serves as-is. To ship a change: build, then
commit both folders. The build uses a relative base, so it also works from any other sub-path.

## Later phases (not built)

Drive time via a routing API · "Open now" from Places hours · user accounts.
