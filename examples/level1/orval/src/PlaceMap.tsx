import Alert from '@mui/material/Alert';
import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import type { Coordinate } from 'ol/coordinate.js';
import { containsCoordinate } from 'ol/extent.js';
import Point from 'ol/geom/Point.js';
import Translate from 'ol/interaction/Translate.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat, transform } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import { Circle, Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';
import { useEffect, useRef, useState } from 'react';
import { useMapStore } from './map-store';
import { categoryColors, latitudeLimit, type Coordinates, type PlaceSummary } from './places';

const land = new Style({
  fill: new Fill({ color: '#eef0dd' }),
  stroke: new Stroke({ color: '#9ba88e', width: 0.85 }),
});
const referenceLine = new Style({
  stroke: new Stroke({ color: '#a6b7ac', width: 0.65, lineDash: [4, 5] }),
});
const draftStyle = new Style({
  image: new Circle({
    radius: 11,
    fill: new Fill({ color: '#ffe19b' }),
    stroke: new Stroke({ color: '#503b14', width: 3 }),
  }),
});

function mapCoordinates(position: Coordinate): Coordinates {
  const [longitude, latitude] = transform(position, 'EPSG:3857', 'EPSG:4326');
  return {
    longitude: Math.max(-180, Math.min(180, Number(longitude.toFixed(6)))),
    latitude: Math.max(-latitudeLimit, Math.min(latitudeLimit, Number(latitude.toFixed(6)))),
  };
}

type Props = {
  places: PlaceSummary[];
  selectedId: number | undefined;
  selectedPlace: PlaceSummary | undefined;
  draft?: { coordinates?: Coordinates; placeId?: number; saving: boolean };
  onSelect: (id: number) => void;
  onPick: (coordinates: Coordinates) => void;
  onDrag: (coordinates: Coordinates) => void;
};

export function PlaceMap(props: Props) {
  const target = useRef<HTMLDivElement>(null);
  const { onSelect, onPick, onDrag } = props;
  const actions = useRef({ onSelect, onPick, onDrag });
  const mapRef = useRef<Map | null>(null);
  const translateRef = useRef<Translate | null>(null);
  const [pins] = useState(() => new VectorSource<Feature<Point>>({ wrapX: false }));
  const [draftPin] = useState(() => new Feature<Point>());
  const [tileError, setTileError] = useState(false);
  const picking = useMapStore((state) => state.picking);

  useEffect(() => {
    actions.current = { onSelect, onPick, onDrag };
  }, [onSelect, onPick, onDrag]);

  useEffect(() => {
    const tiles = new PMTilesVectorSource({
      url: new URL('/map/world.pmtiles', window.location.origin).href,
      wrapX: false,
    });
    const pinLayer = new VectorLayer({ source: pins });
    const draftLayer = new VectorLayer({
      source: new VectorSource({ features: [draftPin], wrapX: false }),
      style: draftStyle,
    });
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
        draftLayer,
      ],
      view: new View({
        center: fromLonLat([22, 19]),
        zoom: 1.8,
        minZoom: 1,
        maxZoom: 10,
      }),
    });
    mapRef.current = map;
    // 保存済みのピンは動かさず、下書き用のピンだけドラッグできるようにする。
    const translate = new Translate({ features: new Collection([draftPin]), hitTolerance: 6 });
    translate.setActive(false);
    map.addInteraction(translate);
    translateRef.current = translate;
    translate.on('translateend', (event) => {
      if (event.coordinate[0] === event.startCoordinate[0] && event.coordinate[1] === event.startCoordinate[1]) return;
      const position = draftPin.getGeometry()?.getCoordinates();
      if (position) actions.current.onDrag(mapCoordinates(position));
    });
    tiles.on('tileloaderror', () => setTileError(true));
    tiles.on('tileloadend', () => setTileError(false));

    map.on('singleclick', (event) => {
      if (useMapStore.getState().picking) {
        actions.current.onPick(mapCoordinates(event.coordinate));
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
      translateRef.current = null;
      draftLayer.getSource()?.clear();
      map.dispose();
    };
  }, [draftPin, pins]);

  const editingPlaceId = props.draft?.placeId;
  useEffect(() => {
    pins.clear();
    pins.addFeatures(props.places.filter((place) => place.id !== editingPlaceId).map((place) => {
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
  }, [editingPlaceId, pins, props.places, props.selectedId]);

  const editing = props.draft !== undefined;
  const canDrag = editing && !props.draft?.saving;
  useEffect(() => {
    translateRef.current?.setActive(canDrag);
  }, [canDrag]);

  const draftLongitude = props.draft?.coordinates?.longitude;
  const draftLatitude = props.draft?.coordinates?.latitude;
  useEffect(() => {
    if (!editing) {
      draftPin.setGeometry(undefined);
      return;
    }
    // 入力の途中で無効になっても、直前の位置からドラッグを続けられる。
    if (draftLongitude === undefined || draftLatitude === undefined) return;
    const position = fromLonLat([draftLongitude, draftLatitude]);
    draftPin.setGeometry(new Point(position));
    const map = mapRef.current;
    const size = map?.getSize();
    if (map && size && !containsCoordinate(map.getView().calculateExtent(size), position)) {
      map.getView().setCenter(position);
    }
  }, [draftPin, draftLongitude, draftLatitude, editing]);

  const longitude = props.selectedPlace?.longitude;
  const latitude = props.selectedPlace?.latitude;
  useEffect(() => {
    if (editing || longitude === undefined || latitude === undefined) return;
    mapRef.current?.getView().animate({
      center: fromLonLat([longitude, latitude]),
      duration: 250,
    });
  }, [editing, longitude, latitude]);

  return (
    <div className={picking ? 'map-shell is-picking' : 'map-shell'}>
      <div ref={target} className="map-target" aria-label="世界地図" tabIndex={0} />
      {tileError && <Alert severity="warning" className="map-warning">背景地図を取得できませんでした。</Alert>}
    </div>
  );
}
