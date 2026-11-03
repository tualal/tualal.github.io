import { useState } from 'react';
import { BAND_LABELS, BANDS } from '../lib/geo';
import { CATEGORY_LABELS, glyphSvg, shapeSvg, TIER_LABELS, TIERS_BY_CATEGORY } from '../lib/encoding';
import { readJson, writeJson } from '../lib/storage';

export function Legend() {
  const [open, setOpen] = useState(() => readJson('np.legendOpen', true));
  const set = (v: boolean) => {
    setOpen(v);
    writeJson('np.legendOpen', v);
  };

  if (!open) {
    return (
      <button type="button" className="legend-toggle" onClick={() => set(true)} aria-expanded="false">
        Legend
      </button>
    );
  }
  return (
    <section className="legend" aria-label="Legend">
      <header>
        <h2>Legend</h2>
        <button type="button" className="icon-btn" onClick={() => set(false)} aria-label="Hide legend" aria-expanded="true">
          ×
        </button>
      </header>
      <h3>Color = distance from home</h3>
      <ul className="legend-bands">
        {BANDS.map((b) => (
          <li key={b} data-band={b}>
            <span className="chip-swatch" aria-hidden="true" />
            {BAND_LABELS[b]}
          </li>
        ))}
      </ul>
      <h3>Icon = category · Shape = tier</h3>
      {(['trails', 'food'] as const).map((c) => (
        <ul key={c} className="legend-shapes">
          <li className="legend-cat">
            <span className="legend-shape" dangerouslySetInnerHTML={{ __html: glyphSvg(c) }} />
            {CATEGORY_LABELS[c]}
          </li>
          {TIERS_BY_CATEGORY[c].map((t) => (
            <li key={t}>
              <span className="legend-shape" dangerouslySetInnerHTML={{ __html: shapeSvg(t) }} />
              {TIER_LABELS[t]}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
