import type { SpotWithDistance } from '../types';
import { CATEGORY_LABELS, pinSvg, TIER_LABELS } from '../lib/encoding';
import { BAND_LABELS, formatMiles } from '../lib/geo';
import type { SpotMark } from '../lib/storage';

interface Props {
  spot: SpotWithDistance;
  homeLabel: string;
  isMarked: (id: string, mark: SpotMark) => boolean;
  onToggleMark: (id: string, mark: SpotMark) => void;
  onClose: () => void;
}

export function googleMapsUrl(s: Pick<SpotWithDistance, 'name' | 'lat' | 'lon' | 'googlePlaceId'>): string {
  // https://developers.google.com/maps/documentation/urls/get-started#search-action
  const params = new URLSearchParams({ api: '1' });
  if (s.googlePlaceId) {
    params.set('query', s.name);
    params.set('query_place_id', s.googlePlaceId);
  } else {
    params.set('query', `${s.lat},${s.lon}`);
  }
  return `https://www.google.com/maps/search/?${params}`;
}

export function DetailCard({ spot, homeLabel, isMarked, onToggleMark, onClose }: Props) {
  const saved = isMarked(spot.id, 'saved');
  const visited = isMarked(spot.id, 'visited');
  return (
    <article className="detail" aria-labelledby="detail-title" data-band={spot.band}>
      <header>
        <span className="detail-shape" dangerouslySetInnerHTML={{ __html: pinSvg(spot.tier) }} />
        <div>
          <h2 id="detail-title">{spot.name}</h2>
          <p className="muted">
            {CATEGORY_LABELS[spot.category]} · {TIER_LABELS[spot.tier]}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>

      <dl className="detail-stats">
        <div>
          <dt>Distance</dt>
          <dd>
            {formatMiles(spot.miles)} <span className="muted">({BAND_LABELS[spot.band]})</span>
          </dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>
            ★ {spot.rating.toFixed(1)} <span className="muted">({spot.reviewCount.toLocaleString()} reviews)</span>
          </dd>
        </div>
      </dl>
      <p className="muted small">Straight-line distance from {homeLabel}.</p>

      {spot.notes && <p className="detail-notes">{spot.notes}</p>}
      {spot.tags.length > 0 && (
        <ul className="tags">
          {spot.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <div className="detail-actions">
        <button type="button" className="toggle" aria-pressed={saved} onClick={() => onToggleMark(spot.id, 'saved')}>
          {saved ? '♥ Saved' : '♡ Save'}
        </button>
        <button type="button" className="toggle" aria-pressed={visited} onClick={() => onToggleMark(spot.id, 'visited')}>
          {visited ? '✓ Visited' : 'Mark visited'}
        </button>
        <a className="primary-btn" href={googleMapsUrl(spot)} target="_blank" rel="noopener noreferrer">
          Open in Google Maps
        </a>
      </div>
    </article>
  );
}
