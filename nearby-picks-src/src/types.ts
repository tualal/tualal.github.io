export type Category = 'trails' | 'food';

export type TrailTier = 'easy' | 'moderate' | 'hard';
export type FoodTier = 'must-try' | 'great' | 'good';
export type Tier = TrailTier | FoodTier;

export interface Spot {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: Category;
  rating: number;
  reviewCount: number;
  tier: Tier;
  tags: string[];
  notes: string;
  /** Empty until scripts/fetch-spots.mjs resolves it. */
  googlePlaceId: string;
  /** Id of the coverage area (src/data/areas.json) this spot was fetched for. */
  area?: string;
}

/** A region the data covers. Written by scripts/fetch-spots.mjs from data/sources.json. */
export interface Area {
  id: string;
  label: string;
  lat: number;
  lon: number;
  radiusMiles: number;
}

/** Distance band index: 0 = 0–5 mi, 1 = 5–10, 2 = 10–15, 3 = 15+. */
export type Band = 0 | 1 | 2 | 3;

export interface Home {
  lat: number;
  lon: number;
  label: string;
}

export interface SpotWithDistance extends Spot {
  miles: number;
  band: Band;
}
