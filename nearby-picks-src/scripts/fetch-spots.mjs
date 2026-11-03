#!/usr/bin/env node
/**
 * Build src/data/spots.json (and src/data/areas.json) from the Google Places API (New) — Text Search.
 *
 *   GOOGLE_PLACES_API_KEY=... npm run fetch-spots            # fetch + write
 *   npm run fetch-spots -- --dry-run                          # fetch + print, don't write
 *   npm run fetch-spots -- --area gresham                     # refresh one area, keep the others as they are
 *   npm run fetch-spots:fixture                               # offline test run with fake places, no key
 *
 * The key is read from the environment (or a local, git-ignored .env via --env-file) and is only
 * ever used here in Node. Nothing under scripts/ or data/ is imported by the client bundle.
 *
 * Inputs:  data/sources.json      (areas, query templates, thresholds, trails with manual difficulty)
 *          data/press-picks.json  (curated lists → score bonus)
 *          src/data/spots.json    (previous output; ids, notes and tags are preserved)
 * Output:  src/data/spots.json, src/data/areas.json, data/trail-candidates.json (unrated trails)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  bayesianRating,
  foodTier,
  haversineMiles,
  normalizeName,
  pressBonus,
  priorMean,
  slugify,
  TRAIL_TIERS,
} from './lib/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  sources: path.join(ROOT, 'data/sources.json'),
  press: path.join(ROOT, 'data/press-picks.json'),
  candidates: path.join(ROOT, 'data/trail-candidates.json'),
  spots: path.join(ROOT, 'src/data/spots.json'),
  areas: path.join(ROOT, 'src/data/areas.json'),
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const DRY_RUN = args.includes('--dry-run');
const FIXTURE = flag('--fixture');
const ONLY_AREA = flag('--area');
if (flag('--sources')) P.sources = path.resolve(flag('--sources'));

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
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

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

function makeSearch({ apiKey, fixture }) {
  let calls = 0;
  const search = fixture
    ? async (query) => {
        calls++;
        return (fixture[query] ?? []).map(toPlace);
      }
    : async function searchText(query, area, pages = 1) {
        const out = [];
        let pageToken;
        for (let page = 0; page < pages; page++) {
          calls++;
          const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
            body: JSON.stringify({
              textQuery: query,
              pageSize: 20,
              locationBias: {
                circle: {
                  center: { latitude: area.center.lat, longitude: area.center.lon },
                  radius: Math.min(50000, area.radiusMiles * 1609.34), // API max is 50 km
                },
              },
              ...(pageToken && { pageToken }),
            }),
          });
          if (!res.ok) {
            throw new Error(`Places searchText failed (${res.status}) for "${query}": ${(await res.text()).slice(0, 500)}`);
          }
          const json = await res.json();
          out.push(...(json.places ?? []).map(toPlace));
          pageToken = json.nextPageToken;
          if (!pageToken) break;
        }
        return out;
      };
  return { search, calls: () => calls };
}

const inArea = (p, area) =>
  Number.isFinite(p.lat) && haversineMiles(area.center.lat, area.center.lon, p.lat, p.lon) <= area.radiusMiles;
const expand = (templates, town) => templates.map((t) => ({ q: t.q.replaceAll('{town}', town), pages: t.pages ?? 1 }));

async function main() {
  const sources = await readJson(P.sources);
  const press = await readJson(P.press);
  const existing = await readJson(P.spots).catch(() => []);
  const existingByPid = new Map(existing.filter((s) => s.googlePlaceId).map((s) => [s.googlePlaceId, s]));
  const existingById = new Map(existing.map((s) => [s.id, s]));

  const areas = sources.areas ?? [];
  const areaIds = new Set(areas.map((a) => a.id));
  if (ONLY_AREA && !areaIds.has(ONLY_AREA)) throw new Error(`Unknown --area "${ONLY_AREA}". Known: ${[...areaIds].join(', ')}`);
  for (const t of [...(sources.trails ?? []), ...(sources.food?.include ?? [])]) {
    if (!areaIds.has(t.area)) throw new Error(`"${t.name ?? t.query}" has area "${t.area}", which isn't in areas[]`);
  }
  for (const t of sources.trails ?? []) {
    if (!TRAIL_TIERS.includes(t.difficulty)) {
      throw new Error(`Trail "${t.name}" has difficulty "${t.difficulty}"; expected one of ${TRAIL_TIERS.join(', ')}`);
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!FIXTURE && !apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set. Put it in nearby-picks-src/.env (git-ignored) or export it.');
    process.exit(1);
  }
  const { search, calls } = makeSearch({ apiKey, fixture: FIXTURE ? await readJson(path.resolve(FIXTURE)) : null });

  const todo = ONLY_AREA ? areas.filter((a) => a.id === ONLY_AREA) : areas;
  // When refreshing one area, keep every other area's spots untouched.
  const kept = ONLY_AREA ? existing.filter((s) => s.area && s.area !== ONLY_AREA) : [];
  const usedIds = new Set(kept.map((s) => s.id));
  const seenPids = new Set(kept.map((s) => s.googlePlaceId).filter(Boolean));

  /** Stable id: reuse the previous id for this place, else the configured id, else a slug. */
  const idFor = (pid, preferred, category, name) => {
    const base = existingByPid.get(pid)?.id ?? preferred ?? `${category === 'trails' ? 'trail' : 'food'}-${slugify(name)}`;
    let id = base;
    for (let i = 2; usedIds.has(id); i++) id = `${base}-${i}`;
    usedIds.add(id);
    return id;
  };

  const manualTrailByPid = new Map();
  const manualTrailByName = new Map();
  for (const t of sources.trails ?? []) {
    if (t.googlePlaceId) manualTrailByPid.set(t.googlePlaceId, t);
    manualTrailByName.set(normalizeName(t.name), t);
  }

  const trails = [];
  const candidates = [];
  const foodPools = []; // { area, eligible: [{ place, include }] }

  for (const area of todo) {
    // ---------- Trails: manual list (difficulty is manual) ----------
    const placedManual = new Set();
    for (const t of (sources.trails ?? []).filter((x) => x.area === area.id)) {
      const [hit] = (await search(t.query ?? t.name, area, 1)).filter(
        (p) => (!t.googlePlaceId || p.googlePlaceId === t.googlePlaceId) && inArea(p, area),
      );
      if (!hit) {
        console.warn(`! [${area.id}] trail not found: ${t.name}`);
        const prev = existingById.get(t.id);
        if (prev) trails.push(prev), usedIds.add(prev.id), seenPids.add(prev.googlePlaceId);
        continue;
      }
      if (seenPids.has(hit.googlePlaceId)) continue;
      seenPids.add(hit.googlePlaceId);
      placedManual.add(t);
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
        area: area.id,
      });
    }

    // ---------- Trails: discovery → unrated candidates for you to rate ----------
    const td = sources.trailDiscovery ?? {};
    for (const town of area.towns ?? []) {
      for (const { q, pages } of expand(td.queryTemplates ?? [], town)) {
        for (const p of await search(q, area, pages)) {
          if (seenPids.has(p.googlePlaceId) || !inArea(p, area) || p.businessStatus !== 'OPERATIONAL') continue;
          if (p.reviewCount < (td.minReviews ?? 50)) continue;
          if (manualTrailByPid.has(p.googlePlaceId) || manualTrailByName.has(normalizeName(p.name))) continue;
          seenPids.add(p.googlePlaceId);
          candidates.push({
            area: area.id,
            name: p.name,
            googlePlaceId: p.googlePlaceId,
            difficulty: '',
            rating: p.rating,
            reviewCount: p.reviewCount,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.googlePlaceId}`,
          });
        }
      }
    }

    // ---------- Food candidates ----------
    const f = sources.food ?? {};
    const pool = new Map();
    for (const town of area.towns ?? []) {
      for (const { q, pages } of expand(f.queryTemplates ?? [], town)) {
        for (const p of await search(q, area, pages)) if (!pool.has(p.googlePlaceId)) pool.set(p.googlePlaceId, { place: p });
      }
    }
    for (const inc of (f.include ?? []).filter((x) => x.area === area.id)) {
      const [hit] = (await search(inc.query, area, 1)).filter((p) => inArea(p, area));
      if (!hit) console.warn(`! [${area.id}] include not found: ${inc.query}`);
      else pool.set(hit.googlePlaceId, { place: hit, include: inc });
    }
    const eligible = [...pool.values()].filter(
      ({ place: p, include }) =>
        !seenPids.has(p.googlePlaceId) &&
        p.businessStatus === 'OPERATIONAL' &&
        inArea(p, area) &&
        (include || p.reviewCount >= (f.minReviews ?? 50)),
    );
    eligible.forEach((e) => seenPids.add(e.place.googlePlaceId));
    foodPools.push({ area, eligible });
  }

  // ---------- Food scoring: one prior across all areas so tiers mean the same everywhere ----------
  const f = sources.food ?? {};
  const C = priorMean(foodPools.flatMap((x) => x.eligible.map((e) => e.place)));
  const m = f.priorWeight ?? 150;
  const food = [];
  const report = [];
  for (const { area, eligible } of foodPools) {
    const scored = eligible
      .map(({ place: p, include }) => {
        const adjusted = bayesianRating(p.rating, p.reviewCount, C, m);
        const { bonus, lists } = pressBonus(p, press);
        const score = adjusted + bonus;
        // Hand-picked includes stay on the map even if they score below the "good" bar.
        const tier = foodTier(score, f.tierThresholds) ?? (include ? 'good' : null);
        return { p, include, adjusted, bonus, lists, score, tier };
      })
      .filter((s) => s.tier)
      .sort((a, b) => b.score - a.score)
      .filter((s, i) => s.include || i < (f.maxSpotsPerArea ?? 40));
    for (const s of scored) {
      const { p, include, tier } = s;
      const prev = existingByPid.get(p.googlePlaceId) ?? (include && existingById.get(include.id));
      food.push({
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
        area: area.id,
      });
      report.push({
        area: area.id,
        name: p.name.slice(0, 32),
        rating: p.rating,
        reviews: p.reviewCount,
        adjusted: fmt(s.adjusted),
        press: s.bonus ? `+${fmt(s.bonus)} (${s.lists.length})` : '',
        score: fmt(s.score),
        tier,
      });
    }
  }

  // ---------- Report ----------
  console.log(`\nFood prior mean C = ${fmt(C, 3)}, prior weight m = ${m}`);
  console.table(report);
  for (const area of todo) {
    const t = trails.filter((s) => s.area === area.id).length;
    const fd = food.filter((s) => s.area === area.id).length;
    const c = candidates.filter((s) => s.area === area.id).length;
    console.log(`[${area.id}] trails: ${t}  food: ${fd}  unrated trail candidates: ${c}`);
  }
  console.log(`Places API requests: ${calls()}`);

  const spots = [...kept, ...trails, ...food];
  const lines = (arr) => `[\n${arr.map((s) => `  ${JSON.stringify(s)}`).join(',\n')}\n]\n`;
  const areasOut = areas.map((a) => ({ id: a.id, label: a.label, lat: a.center.lat, lon: a.center.lon, radiusMiles: a.radiusMiles }));

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing any files');
    return;
  }
  await writeFile(P.spots, lines(spots));
  await writeFile(P.areas, JSON.stringify(areasOut, null, 2) + '\n');
  // Merge candidates: keep earlier ones for areas we didn't refresh.
  const prevCandidates = await readJson(P.candidates).catch(() => []);
  const mergedCandidates = [...prevCandidates.filter((c) => !todo.some((a) => a.id === c.area)), ...candidates];
  await writeFile(P.candidates, lines(mergedCandidates));
  console.log(`Wrote ${path.relative(ROOT, P.spots)}, ${path.relative(ROOT, P.areas)}, ${path.relative(ROOT, P.candidates)}`);
  if (candidates.length) {
    console.log(
      `\n${candidates.length} trail(s) need a difficulty. Open data/trail-candidates.json, set "difficulty" to easy/moderate/hard,\n` +
        'move them into "trails" in data/sources.json (add tags/notes if you like), then run this again.',
    );
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
