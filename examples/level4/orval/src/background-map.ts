import Map from 'ol/Map.js';
import View from 'ol/View.js';
import type BaseLayer from 'ol/layer/Base.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat } from 'ol/proj.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';

const land = new Style({
  fill: new Fill({ color: '#eef0dd' }),
  stroke: new Stroke({ color: '#9ba88e', width: 0.85 }),
});
const referenceLine = new Style({
  stroke: new Stroke({ color: '#a6b7ac', width: 0.65, lineDash: [4, 5] }),
});

export function createBackgroundMap(target: HTMLElement, layers: BaseLayer[], onTileError: (failed: boolean) => void) {
  const tiles = new PMTilesVectorSource({
    url: new URL('/map/world.pmtiles', window.location.origin).href,
    wrapX: false,
  });
  tiles.on('tileloaderror', () => onTileError(true));
  tiles.on('tileloadend', () => onTileError(false));
  const background = new VectorTileLayer({
    source: tiles,
    style: (feature) => {
      const type = feature.getGeometry()?.getType();
      if (type === 'Polygon' || type === 'MultiPolygon') return land;
      if (type === 'LineString' || type === 'MultiLineString') return referenceLine;
    },
  });
  return new Map({
    target,
    layers: [background, ...layers],
    view: new View({
      center: fromLonLat([22, 19]),
      zoom: 1.8,
      minZoom: 1,
      maxZoom: 10,
    }),
  });
}
