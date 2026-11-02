import type { Band, Category, SpotWithDistance, Tier } from '../types';
import { BANDS } from './geo';
import { ALL_TIERS, TIERS_BY_CATEGORY } from './encoding';

export interface Filters {
  category: Category | 'all';
  /** Empty set = no tier restriction. */
  tiers: ReadonlySet<Tier>;
  /** Empty set = no distance restriction. */
  bands: ReadonlySet<Band>;
  query: string;
}

export const EMPTY_FILTERS: Filters = { category: 'all', tiers: new Set(), bands: new Set(), query: '' };

type Facet = 'category' | 'tiers' | 'bands' | 'query';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matchesQuery(spot: SpotWithDistance, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize([spot.name, spot.notes, spot.tier, ...spot.tags].join(' '));
  return terms.every((t) => haystack.includes(t));
}

function passes(spot: SpotWithDistance, f: Filters, skip?: Facet): boolean {
  if (skip !== 'category' && f.category !== 'all' && spot.category !== f.category) return false;
  if (skip !== 'tiers' && f.tiers.size > 0 && !f.tiers.has(spot.tier)) return false;
  if (skip !== 'bands' && f.bands.size > 0 && !f.bands.has(spot.band)) return false;
  if (skip !== 'query' && !matchesQuery(spot, f.query)) return false;
  return true;
}

export function applyFilters(spots: SpotWithDistance[], f: Filters): SpotWithDistance[] {
  return spots.filter((s) => passes(s, f));
}

export interface FacetCounts {
  category: Record<Category | 'all', number>;
  tiers: Record<Tier, number>;
  bands: Record<Band, number>;
}

/**
 * Faceted counts: each chip shows how many spots you would see if that chip were the
 * only selection in its group, with every *other* group's filters still applied.
 */
export function facetCounts(spots: SpotWithDistance[], f: Filters): FacetCounts {
  const category = { all: 0, trails: 0, food: 0 };
  const tiers = Object.fromEntries(ALL_TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  const bands = Object.fromEntries(BANDS.map((b) => [b, 0])) as Record<Band, number>;

  for (const s of spots) {
    if (passes(s, f, 'category')) {
      category.all++;
      category[s.category]++;
    }
    if (passes(s, f, 'tiers')) tiers[s.tier]++;
    if (passes(s, f, 'bands')) bands[s.band]++;
  }
  return { category, tiers, bands };
}

/** Tiers worth showing as chips for the current category selection. */
export function visibleTiers(category: Filters['category']): readonly Tier[] {
  return category === 'all' ? ALL_TIERS : TIERS_BY_CATEGORY[category];
}
