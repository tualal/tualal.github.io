import type { Category, Tier } from '../types';

/**
 * Pin encoding: colour = distance band (CSS vars --band-0..3, themed in styles.css),
 * shape = tier. Each of the six tiers gets its own shape so a pin reads unambiguously
 * without relying on colour.
 */
export const TIERS_BY_CATEGORY: Record<Category, readonly Tier[]> = {
  trails: ['easy', 'moderate', 'hard'],
  food: ['must-try', 'great', 'good'],
};

export const ALL_TIERS: readonly Tier[] = [...TIERS_BY_CATEGORY.trails, ...TIERS_BY_CATEGORY.food];

export const CATEGORY_LABELS: Record<Category, string> = { trails: 'Trails', food: 'Food' };

export const TIER_LABELS: Record<Tier, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  'must-try': 'Must-try',
  great: 'Great',
  good: 'Good',
};

export function categoryOfTier(tier: Tier): Category {
  return (TIERS_BY_CATEGORY.trails as readonly Tier[]).includes(tier) ? 'trails' : 'food';
}

/** SVG inner markup for each tier shape, drawn in a 24×24 viewBox. */
const SHAPES: Record<Tier, string> = {
  easy: '<circle cx="12" cy="12" r="8" />',
  moderate: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />',
  hard: '<path d="M12 3 L21.5 20 H2.5 Z" />',
  'must-try':
    '<path d="M12 2.2 L14.9 8.6 L21.8 9.3 L16.6 14 L18.1 20.9 L12 17.3 L5.9 20.9 L7.4 14 L2.2 9.3 L9.1 8.6 Z" />',
  great: '<path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" />',
  good: '<path d="M12 3 L19.8 7.5 V16.5 L12 21 L4.2 16.5 V7.5 Z" />',
};

export function shapeSvg(tier: Tier, extraClass = ''): string {
  return `<svg class="shape ${extraClass}" viewBox="0 0 24 24" aria-hidden="true">${SHAPES[tier]}</svg>`;
}
