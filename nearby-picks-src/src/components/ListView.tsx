import { useEffect, useRef } from 'react';
import type { SpotWithDistance, Tier } from '../types';
import { ALL_TIERS, CATEGORY_LABELS, categoryOfTier, pinSvg, shapeSvg, TIER_LABELS } from '../lib/encoding';
import { formatMiles } from '../lib/geo';
import type { SpotMark } from '../lib/storage';

interface Props {
  spots: SpotWithDistance[];
  selectedId: string | null;
  showCategory: boolean;
  isMarked: (id: string, mark: SpotMark) => boolean;
  onSelect: (id: string) => void;
}

export function ListView({ spots, selectedId, showCategory, isMarked, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected row in view when the selection comes from the map.
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const groups = ALL_TIERS.map((tier) => ({
    tier,
    items: spots.filter((s) => s.tier === tier).sort((a, b) => a.miles - b.miles),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="list empty" ref={listRef}>
        <p>No spots match these filters.</p>
      </div>
    );
  }

  return (
    <div className="list" ref={listRef}>
      {groups.map(({ tier, items }) => (
        <section key={tier} aria-labelledby={`grp-${tier}`}>
          <h2 id={`grp-${tier}`} className="list-group">
            <span className="legend-shape" dangerouslySetInnerHTML={{ __html: shapeSvg(tier as Tier) }} />
            {showCategory && `${CATEGORY_LABELS[categoryOfTier(tier)]} · `}
            {TIER_LABELS[tier]}
            <span className="muted"> ({items.length})</span>
          </h2>
          <ul>
            {items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="list-row"
                  data-id={s.id}
                  data-band={s.band}
                  aria-current={s.id === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(s.id)}
                >
                  <span className="list-shape" dangerouslySetInnerHTML={{ __html: pinSvg(s.tier) }} />
                  <span className="list-main">
                    <span className="list-name">{s.name}</span>
                    <span className="muted small">
                      ★ {s.rating.toFixed(1)} · {s.reviewCount.toLocaleString()} reviews
                      {isMarked(s.id, 'saved') && ' · ♥'}
                      {isMarked(s.id, 'visited') && ' · ✓'}
                    </span>
                  </span>
                  <span className="list-dist">{formatMiles(s.miles)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
