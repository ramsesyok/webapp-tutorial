import Alert from '@mui/material/Alert';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import { Circle, Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';
import { useEffect, useRef, useState } from 'react';
import { useMapStore } from './map-store';
import { categoryColors, type Coordinates, type PlaceSummary } from './places';

const land = new Style({
  fill: new Fill({ color: '#eef0dd' }),
  stroke: new Stroke({ color: '#9ba88e', width: 0.85 }),
});
const referenceLine = new Style({
  stroke: new Stroke({ color: '#a6b7ac', width: 0.65, lineDash: [4, 5] }),
});

type Props = {
  places: PlaceSummary[];
  selectedId: number | undefined;
  selectedPlace: PlaceSummary | undefined;
  onSelect: (id: number) => void;
  onPick: (coordinates: Coordinates) => void;
};

export function PlaceMap(props: Props) {
  const target = useRef<HTMLDivElement>(null);
  const actions = useRef({ onSelect: props.onSelect, onPick: props.onPick });
  const mapRef = useRef<Map | null>(null);
  const [pins] = useState(() => new VectorSource<Feature<Point>>({ wrapX: false }));
  const [tileError, setTileError] = useState(false);
  const picking = useMapStore((state) => state.picking);

  useEffect(() => {
    actions.current = { onSelect: props.onSelect, onPick: props.onPick };
  }, [props.onSelect, props.onPick]);

  useEffect(() => {
    const tiles = new PMTilesVectorSource({
      url: new URL('/map/world.pmtiles', window.location.origin).href,
      wrapX: false,
    });
    const pinLayer = new VectorLayer({ source: pins });
    const map = new Map({
      target: target.current!,
      layers: [
        new VectorTileLayer({
          source: tiles,
          style: (feature) => {
            const type = feature.getGeometry()?.getType();
            if (type === 'Polygon' || type === 'MultiPolygon') return land;
            if (type === 'LineString' || type === 'MultiLineString') return referenceLine;
          },
        }),
        pinLayer,
      ],
      view: new View({
        center: fromLonLat([22, 19]),
        zoom: 1.8,
        minZoom: 1,
        maxZoom: 10,
      }),
    });
    mapRef.current = map;
    tiles.on('tileloaderror', () => setTileError(true));
    tiles.on('tileloadend', () => setTileError(false));

    map.on('singleclick', (event) => {
      if (useMapStore.getState().picking) {
        const [longitude, latitude] = toLonLat(event.coordinate);
        actions.current.onPick({
          longitude: Number(longitude.toFixed(6)),
          latitude: Number(latitude.toFixed(6)),
        });
        return;
      }
      const id = map.forEachFeatureAtPixel(event.pixel, (feature) => feature.getId(), {
        layerFilter: (layer) => layer === pinLayer,
        hitTolerance: 5,
      });
      if (typeof id === 'number') actions.current.onSelect(id);
    });
    return () => {
      mapRef.current = null;
      map.dispose();
    };
  }, [pins]);

  useEffect(() => {
    pins.clear();
    pins.addFeatures(props.places.map((place) => {
      const pin = new Feature(new Point(fromLonLat([place.longitude, place.latitude])));
      pin.setId(place.id);
      const selected = place.id === props.selectedId;
      pin.setStyle(new Style({
        zIndex: selected ? 1 : 0,
        image: new Circle({
          radius: selected ? 10 : 7,
          fill: new Fill({ color: categoryColors[place.category] }),
          stroke: new Stroke({ color: selected ? '#17372c' : '#ffffff', width: selected ? 3 : 2 }),
        }),
      }));
      return pin;
    }));
  }, [pins, props.places, props.selectedId]);

  const longitude = props.selectedPlace?.longitude;
  const latitude = props.selectedPlace?.latitude;
  useEffect(() => {
    if (longitude === undefined || latitude === undefined) return;
    mapRef.current?.getView().animate({
      center: fromLonLat([longitude, latitude]),
      duration: 250,
    });
  }, [longitude, latitude]);

  return (
    <div className={picking ? 'map-shell is-picking' : 'map-shell'}>
      <div ref={target} className="map-target" aria-label="世界地図" tabIndex={0} />
      {tileError && <Alert severity="warning" className="map-warning">背景地図を取得できませんでした。</Alert>}
    </div>
  );
}
