import type { Band, Category, Tier } from '../types';
import { BAND_LABELS, BANDS } from '../lib/geo';
import { CATEGORY_LABELS, shapeSvg, TIER_LABELS } from '../lib/encoding';
import { type FacetCounts, type Filters, visibleTiers } from '../lib/filters';

interface Props {
  filters: Filters;
  counts: FacetCounts;
  onChange: (f: Filters) => void;
}

function toggle<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function Chip(props: {
  pressed: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
  icon?: string;
  band?: Band;
}) {
  const { pressed, count, onClick, children, icon, band } = props;
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={pressed}
      data-band={band}
      onClick={onClick}
      disabled={count === 0 && !pressed}
    >
      {icon && <span className="chip-icon" dangerouslySetInnerHTML={{ __html: icon }} />}
      {band !== undefined && <span className="chip-swatch" aria-hidden="true" />}
      <span>{children}</span>
      <span className="chip-count">{count}</span>
    </button>
  );
}

export function FilterBar({ filters, counts, onChange }: Props) {
  const setCategory = (category: Category | 'all') => {
    // Drop tier selections that don't belong to the new category.
    const allowed = new Set(visibleTiers(category));
    const tiers = new Set([...filters.tiers].filter((t) => allowed.has(t)));
    onChange({ ...filters, category, tiers });
  };
  const anyActive =
    filters.category !== 'all' || filters.tiers.size > 0 || filters.bands.size > 0 || filters.query !== '';

  return (
    <div className="filters">
      <div className="search">
        <input
          type="search"
          placeholder="Search name, tag, notes…"
          aria-label="Search spots"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />
        {anyActive && (
          <button
            type="button"
            className="link-btn"
            onClick={() => onChange({ category: 'all', tiers: new Set(), bands: new Set(), query: '' })}
          >
            Reset
          </button>
        )}
      </div>

      <div className="chip-row" role="group" aria-label="Category">
        {(['all', 'trails', 'food'] as const).map((c) => (
          <Chip key={c} pressed={filters.category === c} count={counts.category[c]} onClick={() => setCategory(c)}>
            {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>

      <div className="chip-row" role="group" aria-label="Tier">
        {visibleTiers(filters.category).map((t: Tier) => (
          <Chip
            key={t}
            pressed={filters.tiers.has(t)}
            count={counts.tiers[t]}
            icon={shapeSvg(t)}
            onClick={() => onChange({ ...filters, tiers: toggle(filters.tiers, t) })}
          >
            {TIER_LABELS[t]}
          </Chip>
        ))}
      </div>

      <div className="chip-row" role="group" aria-label="Distance from home">
        {BANDS.map((b) => (
          <Chip
            key={b}
            band={b}
            pressed={filters.bands.has(b)}
            count={counts.bands[b]}
            onClick={() => onChange({ ...filters, bands: toggle(filters.bands, b) })}
          >
            {BAND_LABELS[b]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
