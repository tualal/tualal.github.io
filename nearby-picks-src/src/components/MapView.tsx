import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 locates its worker next to its own module, which breaks once bundled. Point it at the
// emitted asset explicitly (also precached by the service worker, so maps work offline).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Home, SpotWithDistance } from '../types';
import { pinSvg, TIER_LABELS, CATEGORY_LABELS } from '../lib/encoding';
import { BAND_LABELS } from '../lib/geo';
import { FALLBACK_STYLE, STYLE_URLS } from '../lib/mapStyle';

interface Props {
  spots: SpotWithDistance[];
  home: Home;
  selectedId: string | null;
  theme: 'light' | 'dark';
  pickingHome: boolean;
  isMarked: (id: string, mark: 'saved' | 'visited') => boolean;
  onSelect: (id: string | null) => void;
  onPickHome: (lat: number, lon: number) => void;
  /** Bumped by the parent to request a camera move to the selected spot. */
  focusToken: number;
}

maplibregl.setWorkerUrl(workerUrl);

function pinElement(onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pin';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function paintPin(el: HTMLElement, s: SpotWithDistance, selected: boolean, saved: boolean, visited: boolean) {
  const key = `${s.tier}|${s.band}|${selected}|${saved}|${visited}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.dataset.band = String(s.band);
  el.classList.toggle('is-selected', selected);
  el.classList.toggle('is-saved', saved);
  el.classList.toggle('is-visited', visited);
  el.innerHTML = pinSvg(s.tier) + (saved ? '<span class="pin-badge" aria-hidden="true"></span>' : '');
  el.setAttribute(
    'aria-label',
    `${s.name}: ${CATEGORY_LABELS[s.category]}, ${TIER_LABELS[s.tier]}, ${BAND_LABELS[s.band]}` +
      (saved ? ', saved' : '') +
      (visited ? ', visited' : ''),
  );
  el.setAttribute('aria-pressed', String(selected));
}

export function MapView(props: Props) {
  const { spots, home, selectedId, theme, pickingHome, isMarked, onSelect, onPickHome, focusToken } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const homeMarkerRef = useRef<Marker | null>(null);
  // Latest callbacks for listeners registered once.
  const cb = useRef({ onSelect, onPickHome, pickingHome });
  cb.current = { onSelect, onPickHome, pickingHome };

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URLS[theme],
      center: [home.lon, home.lat],
      zoom: 9.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => {
      if (cb.current.pickingHome) cb.current.onPickHome(e.lngLat.lat, e.lngLat.lng);
      else cb.current.onSelect(null);
    });
    let fellBack = false;
    map.on('error', (e) => {
      // If the vector style itself can't load (offline before first cache, provider down), use raster OSM.
      const msg = String(e.error?.message ?? '');
      if (!fellBack && !map.isStyleLoaded() && /style|Failed to fetch|NetworkError/i.test(msg)) {
        fellBack = true;
        map.setStyle(FALLBACK_STYLE);
      }
    });
    // Initial view: home plus every spot, so the first screen shows the whole picture.
    const bounds = new maplibregl.LngLatBounds([home.lon, home.lat], [home.lon, home.lat]);
    for (const s of spots) bounds.extend([s.lon, s.lat]);
    map.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 0 });
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
      homeMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Theme → basemap style. Markers are DOM overlays, so they survive setStyle.
  const appliedTheme = useRef(theme);
  useEffect(() => {
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    mapRef.current?.setStyle(STYLE_URLS[theme]);
  }, [theme]);

  // Home marker (draggable) and recentre when home changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!homeMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'home-pin';
      el.title = 'Home (drag to move)';
      el.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L21 11 H18.5 V20 H14 V14.5 H10 V20 H5.5 V11 H3 Z"/></svg>';
      const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([home.lon, home.lat]).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        cb.current.onPickHome(p.lat, p.lng);
      });
      homeMarkerRef.current = marker;
    } else {
      homeMarkerRef.current.setLngLat([home.lon, home.lat]);
      map.easeTo({ center: [home.lon, home.lat], duration: 600 });
    }
  }, [home.lat, home.lon]);

  // Sync spot markers with the filtered list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const wanted = new Set(spots.map((s) => s.id));
    for (const [id, m] of markers) {
      if (!wanted.has(id)) {
        m.remove();
        markers.delete(id);
      }
    }
    for (const s of spots) {
      let m: Marker | undefined = markers.get(s.id);
      if (!m) {
        m = new maplibregl.Marker({ element: pinElement(() => cb.current.onSelect(s.id)) })
          .setLngLat([s.lon, s.lat])
          .addTo(map);
        markers.set(s.id, m);
      }
      const selected = s.id === selectedId;
      paintPin(m.getElement(), s, selected, isMarked(s.id, 'saved'), isMarked(s.id, 'visited'));
      m.getElement().style.zIndex = selected ? '3' : '';
    }
  }, [spots, selectedId, isMarked]);

  /** Pixels at the bottom of the map hidden by the detail card (phones only; it floats aside on desktop). */
  const bottomInset = () => {
    const card = containerRef.current?.parentElement?.querySelector<HTMLElement>('.detail');
    if (!card || matchMedia('(min-width: 900px)').matches) return 0;
    return card.offsetHeight + 16;
  };

  // List tap: centre the selection in the part of the map the card leaves visible.
  useEffect(() => {
    if (!focusToken || !selectedId) return;
    const s = spots.find((x) => x.id === selectedId);
    const map = mapRef.current;
    if (!s || !map) return;
    requestAnimationFrame(() =>
      map.easeTo({
        center: [s.lon, s.lat],
        zoom: Math.max(map.getZoom(), 11),
        padding: { top: 0, left: 0, right: 0, bottom: bottomInset() },
        duration: 700,
      }),
    );
  }, [focusToken]);

  // Map tap: only pan if the card would cover the pin.
  useEffect(() => {
    const map = mapRef.current;
    const s = spots.find((x) => x.id === selectedId);
    if (!map || !s) return;
    requestAnimationFrame(() => {
      const inset = bottomInset();
      const { y } = map.project([s.lon, s.lat]);
      const visibleBottom = map.getContainer().clientHeight - inset;
      if (inset && y > visibleBottom - 40) map.panBy([0, y - visibleBottom / 2], { duration: 400 });
    });
  }, [selectedId]);

  // MapLibre needs a nudge when its container is shown again after being hidden.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} className={`map${pickingHome ? ' is-picking' : ''}`} role="region" aria-label="Map" />;
}
