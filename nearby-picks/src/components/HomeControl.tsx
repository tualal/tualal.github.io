import { useState } from 'react';
import type { Home } from '../types';

export const DEFAULT_HOME: Home = { lat: 45.498, lon: -122.431, label: 'Gresham, OR' };

interface Props {
  home: Home;
  picking: boolean;
  onSetHome: (h: Home) => void;
  onStartPicking: () => void;
  onClose: () => void;
}

interface GeoResult {
  lat: string;
  lon: string;
  display_name: string;
}

/** Shorten "Gresham, Multnomah County, Oregon, 97030, United States" to its first two parts. */
const shortLabel = (name: string) => name.split(',').slice(0, 2).join(',').trim();

export function HomeControl({ home, picking, onSetHome, onStartPicking, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setStatus('Searching…');
    setResults(null);
    try {
      // OpenStreetMap Nominatim: free, keyless; usage policy asks for ≤1 req/s, so we search on submit only.
      const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '5',
      })}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as GeoResult[];
      setResults(data);
      setStatus(data.length ? null : 'No matches.');
    } catch {
      setStatus(navigator.onLine ? 'Search failed. Try again or tap the map.' : 'Offline. Tap the map to set home instead.');
    }
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) return setStatus('Location not available in this browser.');
    setStatus('Locating…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setStatus(null);
        onSetHome({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'My location' });
      },
      () => setStatus('Could not get your location.'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <div className="home-panel" role="dialog" aria-label="Set home point">
      <header>
        <h2>Home point</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <p className="muted small">
        Currently <strong>{home.label}</strong> ({home.lat.toFixed(3)}, {home.lon.toFixed(3)})
      </p>
      <form onSubmit={search} className="home-search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Address, city or place"
          aria-label="Search for a home location"
        />
        <button type="submit" className="primary-btn">
          Search
        </button>
      </form>
      {status && <p className="muted small">{status}</p>}
      {results && results.length > 0 && (
        <ul className="home-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onClick={() => onSetHome({ lat: Number(r.lat), lon: Number(r.lon), label: shortLabel(r.display_name) })}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="home-actions">
        <button type="button" className="toggle" aria-pressed={picking} onClick={onStartPicking}>
          {picking ? 'Tap the map…' : 'Tap map to set'}
        </button>
        <button type="button" className="toggle" onClick={useMyLocation}>
          Use my location
        </button>
        <button type="button" className="link-btn" onClick={() => onSetHome(DEFAULT_HOME)}>
          Reset to Gresham
        </button>
      </div>
      <p className="muted small">Tip: you can also drag the house pin.</p>
    </div>
  );
}
