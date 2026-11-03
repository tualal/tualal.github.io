import { useCallback, useEffect, useMemo, useState } from 'react';
import rawSpots from './data/spots.json';
import rawAreas from './data/areas.json';
import type { Area, Home, Spot, SpotWithDistance } from './types';
import { bandFor, haversineMiles } from './lib/geo';
import { applyFilters, EMPTY_FILTERS, facetCounts, type Filters } from './lib/filters';
import { usePersistentState, useSpotMarks } from './lib/storage';
import { MapView } from './components/MapView';
import { FilterBar } from './components/FilterBar';
import { Legend } from './components/Legend';
import { DetailCard } from './components/DetailCard';
import { ListView } from './components/ListView';
import { DEFAULT_HOME, HomeControl } from './components/HomeControl';

const spots = rawSpots as Spot[];
const areas = rawAreas as Area[];

type ThemePref = 'system' | 'light' | 'dark';
type View = 'map' | 'list';

const isHome = (v: unknown): v is Home =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Home).lat) &&
  Number.isFinite((v as Home).lon) &&
  typeof (v as Home).label === 'string';

const isThemePref = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';

function useSystemDark() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return dark;
}

export default function App() {
  const [home, setHome] = usePersistentState<Home>('np.home.v1', DEFAULT_HOME, isHome);
  const [themePref, setThemePref] = usePersistentState<ThemePref>('np.theme', 'system', isThemePref);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [view, setView] = useState<View>('map');
  const [homeOpen, setHomeOpen] = useState(false);
  const [pickingHome, setPickingHome] = useState(false);
  const marks = useSpotMarks();

  const systemDark = useSystemDark();
  const theme = themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const withDistance: SpotWithDistance[] = useMemo(
    () =>
      spots.map((s) => {
        const miles = haversineMiles(home.lat, home.lon, s.lat, s.lon);
        return { ...s, miles, band: bandFor(miles) };
      }),
    [home.lat, home.lon],
  );
  // The data is a fixed snapshot of the areas in areas.json. Say so when home moves somewhere they
  // don't cover, instead of silently showing far-away pins.
  const nearbyCount = withDistance.filter((s) => s.miles <= 15).length;
  const nearestMiles = Math.min(...withDistance.map((s) => s.miles));
  const outOfArea =
    nearbyCount < 3 && !areas.some((a) => haversineMiles(home.lat, home.lon, a.lat, a.lon) <= a.radiusMiles);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const homeKey = `${home.lat.toFixed(3)},${home.lon.toFixed(3)}`;

  const visible = useMemo(() => applyFilters(withDistance, filters), [withDistance, filters]);
  const counts = useMemo(() => facetCounts(withDistance, filters), [withDistance, filters]);

  // Drop the selection if filters hide it.
  const selected = visible.find((s) => s.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  const selectFromList = useCallback((id: string) => {
    setSelectedId(id);
    setFocusToken((n) => n + 1);
    // On phones the list covers the map; jump back so the user sees the pin and card.
    if (matchMedia('(max-width: 899px)').matches) setView('map');
  }, []);

  const setHomeAndClose = (h: Home) => {
    setHome(h);
    setPickingHome(false);
    setHomeOpen(false);
  };

  const cycleTheme = () =>
    setThemePref((p) => (p === 'system' ? (systemDark ? 'light' : 'dark') : p === 'light' ? 'dark' : 'system'));

  return (
    <div className="app" data-view={view}>
      <header className="topbar">
        <h1>Nearby Picks</h1>
        <button type="button" className="home-btn" onClick={() => setHomeOpen((o) => !o)} aria-expanded={homeOpen}>
          <span aria-hidden="true">⌂</span> {home.label}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={cycleTheme}
          aria-label={`Theme: ${themePref}. Change theme`}
          title={`Theme: ${themePref}`}
        >
          {themePref === 'system' ? '◐' : themePref === 'dark' ? '☾' : '☀'}
        </button>
      </header>

      {homeOpen && (
        <HomeControl
          home={home}
          picking={pickingHome}
          onSetHome={setHomeAndClose}
          onStartPicking={() => {
            setPickingHome(true);
            setHomeOpen(false);
            setSelectedId(null);
            setView('map');
          }}
          onClose={() => {
            setHomeOpen(false);
            setPickingHome(false);
          }}
        />
      )}

      <aside className="sidebar">
        <FilterBar filters={filters} counts={counts} onChange={setFilters} />
        <div className="view-toggle" role="tablist" aria-label="View">
          {(['map', 'list'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {v === 'map' ? 'Map' : `List (${visible.length})`}
            </button>
          ))}
        </div>
        <ListView
          spots={visible}
          selectedId={selectedId}
          showCategory={filters.category === 'all'}
          isMarked={marks.has}
          onSelect={selectFromList}
        />
      </aside>

      <main className="map-wrap">
        <MapView
          spots={visible}
          home={home}
          selectedId={selectedId}
          theme={theme}
          pickingHome={pickingHome}
          isMarked={marks.has}
          onSelect={setSelectedId}
          onPickHome={(lat, lon) => setHomeAndClose({ lat, lon, label: 'Dropped pin' })}
          focusToken={focusToken}
        />
        {outOfArea && !pickingHome && dismissedFor !== homeKey && (
          <div className="coverage" role="status">
            <p>
              <strong>{nearbyCount === 0 ? 'No spots' : `Only ${nearbyCount} spot${nearbyCount === 1 ? '' : 's'}`} within 15 mi of
              this home.</strong>{' '}
              Nearby Picks covers {areas.length === 1 ? 'one area' : `${areas.length} areas`} so far, so here it can only
              recolor pins, not find new ones. Nearest spot: {Math.round(nearestMiles)} mi.
            </p>
            <div className="coverage-actions">
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="primary-btn"
                  onClick={() => setHome({ lat: a.lat, lon: a.lon, label: a.label })}
                >
                  Go to {a.label}
                </button>
              ))}
              <button type="button" className="link-btn" onClick={() => setDismissedFor(homeKey)}>
                Dismiss
              </button>
            </div>
          </div>
        )}
        {pickingHome && (
          <div className="picking-hint" role="status">
            Tap the map to set your home point
            <button type="button" className="link-btn" onClick={() => setPickingHome(false)}>
              Cancel
            </button>
          </div>
        )}
        {!selected && <Legend />}
        {selected && (
          <DetailCard
            spot={selected}
            homeLabel={home.label}
            isMarked={marks.has}
            onToggleMark={marks.toggle}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}
