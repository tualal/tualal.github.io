// Pure scoring helpers (no I/O) so they can be unit-tested with `node --test`.

/**
 * Bayesian-adjusted rating: shrinks a place's average toward the prior mean C,
 * weighted by how many reviews it has relative to m.
 *   score = (v / (v + m)) * R + (m / (v + m)) * C
 * A 4.9 with 12 reviews no longer beats a 4.7 with 3,000.
 */
export function bayesianRating(rating, reviewCount, priorMean, priorWeight) {
  const v = Math.max(0, reviewCount || 0);
  const m = Math.max(0, priorWeight);
  if (v + m === 0) return priorMean;
  return (v / (v + m)) * (rating || 0) + (m / (v + m)) * priorMean;
}

/** Mean rating across places, weighted by review count (falls back to `fallback` when empty). */
export function priorMean(places, fallback = 4.2) {
  let sum = 0;
  let n = 0;
  for (const p of places) {
    if (!p.rating || !p.reviewCount) continue;
    sum += p.rating * p.reviewCount;
    n += p.reviewCount;
  }
  return n ? sum / n : fallback;
}

export function normalizeName(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Curated-list bonus. A place matches a list entry by googlePlaceId when the entry has one,
 * otherwise by normalized name. Each distinct list counts once; total is capped.
 * Returns { bonus, lists: string[] }.
 */
export function pressBonus(place, press) {
  const per = press?.bonusPerList ?? 0.1;
  const cap = press?.maxBonus ?? 0.25;
  const name = normalizeName(place.name);
  const hits = [];
  for (const list of press?.lists ?? []) {
    const match = (list.places ?? []).some((e) =>
      e.googlePlaceId ? e.googlePlaceId === place.googlePlaceId : normalizeName(e.name) === name,
    );
    if (match) hits.push(list.name);
  }
  return { bonus: Math.min(cap, hits.length * per), lists: hits };
}

/** Maps a final food score to a tier, or null if it falls below the lowest threshold. */
export function foodTier(score, thresholds = { 'must-try': 4.6, great: 4.4, good: 4.2 }) {
  if (score >= thresholds['must-try']) return 'must-try';
  if (score >= thresholds.great) return 'great';
  if (score >= thresholds.good) return 'good';
  return null;
}

export const TRAIL_TIERS = ['easy', 'moderate', 'hard'];

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function slugify(s) {
  return normalizeName(s).replace(/ /g, '-').slice(0, 60);
}
