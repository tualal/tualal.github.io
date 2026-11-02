#!/usr/bin/env node
/**
 * Build src/data/spots.json from the Google Places API (New) — Text Search.
 *
 *   GOOGLE_PLACES_API_KEY=... npm run fetch-spots            # fetch + write
 *   npm run fetch-spots -- --dry-run                          # fetch + print, don't write
 *   node scripts/fetch-spots.mjs --fixture path/to/fixture.json --dry-run   # offline, no key
 *
 * The key is read from the environment (or a local, git-ignored .env via --env-file) and is only
 * ever used here in Node. Nothing under scripts/ or data/ is imported by the client bundle.
 *
 * Inputs:  data/sources.json      (queries, manual trail difficulty, thresholds)
 *          data/press-picks.json  (curated lists → score bonus)
 *          src/data/spots.json    (existing output; ids, notes and tags are preserved)
 * Output:  src/data/spots.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  bayesianRating,
  foodTier,
  haversineMiles,
  pressBonus,
  priorMean,
  slugify,
  TRAIL_TIERS,
} from './lib/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  sources: path.join(ROOT, 'data/sources.json'),
  press: path.join(ROOT, 'data/press-picks.json'),
  out: path.join(ROOT, 'src/data/spots.json'),
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fixtureIdx = args.indexOf('--fixture');
const FIXTURE = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null;
const MAX_PAGES = 3; // Text Search returns ≤20 per page, ≤60 total.

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.primaryType',
  'nextPageToken',
].join(',');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

/** Normalize a Places API (New) place into the fields we use. */
function toPlace(p) {
  return {
    googlePlaceId: p.id,
    name: p.displayName?.text ?? '',
    lat: p.location?.latitude,
    lon: p.location?.longitude,
    rating: p.rating ?? 0,
    reviewCount: p.userRatingCount ?? 0,
    businessStatus: p.businessStatus ?? 'OPERATIONAL',
    primaryType: p.primaryType ?? '',
  };
}

function makeSearch({ apiKey, home, radiusMiles, fixture }) {
  if (fixture) {
    return async (query) => (fixture[query] ?? []).map(toPlace);
  }
  return async function searchText(query, { maxPages = MAX_PAGES } = {}) {
    const out = [];
    let pageToken;
    for (let page = 0; page < maxPages; page++) {
      const body = {
        textQuery: query,
        pageSize: 20,
        locationBias: {
          circle: {
            center: { latitude: home.lat, longitude: home.lon },
            radius: Math.min(50000, radiusMiles * 1609.34), // API max is 50 km
          },
        },
        ...(pageToken && { pageToken }),
      };
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Places searchText failed (${res.status}) for "${query}": ${text.slice(0, 500)}`);
      }
      const json = await res.json();
      out.push(...(json.places ?? []).map(toPlace));
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  };
}

function withinRadius(p, home, radiusMiles) {
  return Number.isFinite(p.lat) && haversineMiles(home.lat, home.lon, p.lat, p.lon) <= radiusMiles;
}

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

async function main() {
  const sources = await readJson(P.sources);
  const press = await readJson(P.press);
  const existing = await readJson(P.out).catch(() => []);
  const existingByPid = new Map(existing.filter((s) => s.googlePlaceId).map((s) => [s.googlePlaceId, s]));
  const existingById = new Map(existing.map((s) => [s.id, s]));

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!FIXTURE && !apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set. Put it in nearby-picks/.env (git-ignored) or export it.');
    process.exit(1);
  }
  const fixture = FIXTURE ? await readJson(path.resolve(FIXTURE)) : null;
  const { home, radiusMiles } = sources;
  const search = makeSearch({ apiKey, home, radiusMiles, fixture });

  const usedIds = new Set();
  /** Stable id: reuse the previous id for this place, else the configured id, else a slug. */
  const idFor = (pid, preferred, category, name) => {
    let id = existingByPid.get(pid)?.id ?? preferred ?? `${category === 'trails' ? 'trail' : 'food'}-${slugify(name)}`;
    for (let i = 2; usedIds.has(id); i++) id = `${id}-${i}`;
    usedIds.add(id);
    return id;
  };

  // ---------- Trails: difficulty is manual ----------
  const trails = [];
  for (const t of sources.trails ?? []) {
    if (!TRAIL_TIERS.includes(t.difficulty)) {
      throw new Error(`Trail "${t.name}" has difficulty "${t.difficulty}"; expected one of ${TRAIL_TIERS.join(', ')}`);
    }
    const [hit] = (await search(t.query ?? t.name, { maxPages: 1 })).filter((p) => withinRadius(p, home, radiusMiles));
    if (!hit) {
      console.warn(`! trail not found within ${radiusMiles} mi: ${t.name}`);
      const prev = existingById.get(t.id);
      if (prev) trails.push(prev), usedIds.add(prev.id); // keep the last known good entry
      continue;
    }
    const prev = existingByPid.get(hit.googlePlaceId) ?? existingById.get(t.id);
    trails.push({
      id: idFor(hit.googlePlaceId, t.id, 'trails', t.name),
      name: t.name ?? hit.name,
      lat: hit.lat,
      lon: hit.lon,
      category: 'trails',
      rating: hit.rating,
      reviewCount: hit.reviewCount,
      tier: t.difficulty,
      tags: t.tags ?? prev?.tags ?? [],
      notes: t.notes ?? prev?.notes ?? '',
      googlePlaceId: hit.googlePlaceId,
    });
  }

  // ---------- Food: Bayesian rating + press bonus ----------
  const f = sources.food ?? {};
  const candidates = new Map(); // googlePlaceId → { place, include? }
  for (const q of f.queries ?? []) {
    for (const p of await search(q)) if (!candidates.has(p.googlePlaceId)) candidates.set(p.googlePlaceId, { place: p });
  }
  for (const inc of f.include ?? []) {
    const [hit] = (await search(inc.query, { maxPages: 1 })).filter((p) => withinRadius(p, home, radiusMiles));
    if (!hit) {
      console.warn(`! include not found: ${inc.query}`);
      continue;
    }
    candidates.set(hit.googlePlaceId, { place: hit, include: inc });
  }

  const eligible = [...candidates.values()].filter(
    ({ place: p, include }) =>
      p.businessStatus === 'OPERATIONAL' &&
      withinRadius(p, home, radiusMiles) &&
      (include || p.reviewCount >= (f.minReviews ?? 50)),
  );
  const C = priorMean(eligible.map((e) => e.place));
  const m = f.priorWeight ?? 150;

  const scored = eligible.map(({ place: p, include }) => {
    const adjusted = bayesianRating(p.rating, p.reviewCount, C, m);
    const { bonus, lists } = pressBonus(p, press);
    const score = adjusted + bonus;
    // Hand-picked includes stay on the map even if they score below the "good" bar.
    const tier = foodTier(score, f.tierThresholds) ?? (include ? 'good' : null);
    return { p, include, adjusted, bonus, lists, score, tier };
  });
  const kept = scored
    .filter((s) => s.tier)
    .sort((a, b) => b.score - a.score)
    .filter((s, i) => s.include || i < (f.maxSpots ?? 40));

  const food = kept.map(({ p, include, tier }) => {
    const prev = existingByPid.get(p.googlePlaceId) ?? (include && existingById.get(include.id));
    return {
      id: idFor(p.googlePlaceId, include?.id, 'food', p.name),
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      category: 'food',
      rating: p.rating,
      reviewCount: p.reviewCount,
      tier,
      tags: include?.tags ?? prev?.tags ?? [],
      notes: include?.notes ?? prev?.notes ?? '',
      googlePlaceId: p.googlePlaceId,
    };
  });

  // ---------- Report ----------
  console.log(`\nFood prior mean C = ${fmt(C, 3)}, prior weight m = ${m}`);
  console.table(
    kept.map((s) => ({
      name: s.p.name.slice(0, 34),
      rating: s.p.rating,
      reviews: s.p.reviewCount,
      adjusted: fmt(s.adjusted),
      press: s.bonus ? `+${fmt(s.bonus)} (${s.lists.length})` : '',
      score: fmt(s.score),
      tier: s.tier,
    })),
  );
  const dropped = scored.filter((s) => !s.tier).length;
  console.log(`Trails: ${trails.length}  Food: ${food.length} (dropped ${dropped} below threshold)`);

  const spots = [...trails, ...food];
  // One spot per line keeps diffs readable when re-running.
  const text = `[\n${spots.map((s) => `  ${JSON.stringify(s)}`).join(',\n')}\n]\n`;
  if (DRY_RUN) {
    console.log('\n--dry-run: not writing', path.relative(ROOT, P.out));
  } else {
    await writeFile(P.out, text);
    console.log('Wrote', path.relative(ROOT, P.out));
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
