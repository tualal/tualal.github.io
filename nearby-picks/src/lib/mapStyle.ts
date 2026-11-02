import type { StyleSpecification } from 'maplibre-gl';

/**
 * Vector basemaps from OpenFreeMap (OpenStreetMap data, no API key).
 * Override with VITE_MAP_STYLE_LIGHT / VITE_MAP_STYLE_DARK if you self-host or switch providers.
 */
export const STYLE_URLS = {
  light: import.meta.env.VITE_MAP_STYLE_LIGHT || 'https://tiles.openfreemap.org/styles/positron',
  dark: import.meta.env.VITE_MAP_STYLE_DARK || 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** Raster OSM fallback used if the vector style fails to load. */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
