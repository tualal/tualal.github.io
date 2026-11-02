import type { Band } from '../types';

const EARTH_RADIUS_MI = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle ("as the crow flies") distance in miles. */
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const BANDS: readonly Band[] = [0, 1, 2, 3];
export const BAND_LABELS: Record<Band, string> = {
  0: '0–5 mi',
  1: '5–10 mi',
  2: '10–15 mi',
  3: '15+ mi',
};

export function bandFor(miles: number): Band {
  if (miles < 5) return 0;
  if (miles < 10) return 1;
  if (miles < 15) return 2;
  return 3;
}

export function formatMiles(miles: number): string {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}
