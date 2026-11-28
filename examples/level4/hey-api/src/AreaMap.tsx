import Alert from '@mui/material/Alert';
import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Polygon from 'ol/geom/Polygon.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { useEffect, useRef, useState } from 'react';
import type { Area } from './api/use-areas';
import type { AreaGeometry } from './area-geometry';
import { createBackgroundMap } from './background-map';

const geoJSON = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
const savedStyle = polygonStyle('rgba(23, 104, 87, 0.17)', '#176857', 2);
const selectedStyle = polygonStyle('rgba(23, 104, 87, 0.25)', '#176857', 3);
const draftStyle = polygonStyle('rgba(227, 155, 53, 0.32)', '#934700', 3);
const referenceStyle = polygonStyle('rgba(255, 255, 255, 0)', '#534468', 3, [7, 5]);

function polygonStyle(fill: string, stroke: string, width: number, lineDash?: number[]) {
  return new Style({ fill: new Fill({ color: fill }), stroke: new Stroke({ color: stroke, width, lineDash }) });
}

function mapPolygon(geometry: AreaGeometry) {
  // GeoJSONは経緯度で保存する。地図で描画・編集する図形はWebメルカトルに変換する。
  const polygon = geoJSON.readGeometry(geometry);
  if (!(polygon instanceof Polygon)) throw new Error('多角形を読み込めませんでした。');
  return polygon;
}

type Props = {
  areas: Area[];
  selected?: Area;
  selectedId?: number;
  hiddenAreaId?: number;
  draft?: AreaGeometry;
  reference?: AreaGeometry;
  mode: 'view' | 'draw' | 'modify' | 'locked';
  onSelect: (areaId: number) => void;
  onGeometryChange: (geometry: AreaGeometry) => void;
};

export function AreaMap({ areas, selected, selectedId, hiddenAreaId, draft, reference, mode, onSelect, onGeometryChange }: Props) {
  const target = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const lastMapChange = useRef<AreaGeometry | undefined>(undefined);
  const actions = useRef({ mode, onSelect, onGeometryChange });
  const [savedAreas] = useState(() => new VectorSource<Feature<Polygon>>({ wrapX: false }));
  const [draftFeature] = useState(() => new Feature<Polygon>());
  const [referenceFeature] = useState(() => new Feature<Polygon>());
  const [tileError, setTileError] = useState(false);

  useEffect(() => { actions.current = { mode, onSelect, onGeometryChange }; }, [mode, onSelect, onGeometryChange]);

  useEffect(() => {
    const savedLayer = new VectorLayer({ source: savedAreas, style: savedStyle });
    const referenceLayer = new VectorLayer({
      source: new VectorSource({ features: [referenceFeature], wrapX: false }), style: referenceStyle,
    });
    const draftLayer = new VectorLayer({
      source: new VectorSource({ features: [draftFeature], wrapX: false }), style: draftStyle,
    });
    const map = createBackgroundMap(target.current!, [savedLayer, referenceLayer, draftLayer], setTileError);
    const draw = new Draw({ type: 'Polygon', stopClick: true, wrapX: false });
    const modify = new Modify({ features: new Collection([draftFeature]), wrapX: false });
    draw.setActive(false);
    modify.setActive(false);
    map.addInteraction(modify);
    map.addInteraction(draw);
    mapRef.current = map;
    drawRef.current = draw;
    modifyRef.current = modify;

    function publishDraft(polygon: Polygon) {
      const geometry = geoJSON.writeGeometryObject(polygon, { rightHanded: true });
      if (geometry.type !== 'Polygon') return;
      lastMapChange.current = geometry;
      actions.current.onGeometryChange(geometry);
    }

    draw.on('drawend', ({ feature }) => {
      const polygon = feature.getGeometry();
      if (!(polygon instanceof Polygon)) return;
      draftFeature.setGeometry(polygon);
      publishDraft(polygon);
    });
    modify.on('modifyend', () => {
      const polygon = draftFeature.getGeometry();
      if (polygon) publishDraft(polygon);
    });
    map.on('singleclick', (event) => {
      if (actions.current.mode !== 'view') return;
      const id = map.forEachFeatureAtPixel(event.pixel, (feature) => feature.getId(), {
        layerFilter: (layer) => layer === savedLayer,
      });
      if (typeof id === 'number') actions.current.onSelect(id);
    });
    return () => {
      mapRef.current = null;
      drawRef.current = null;
      modifyRef.current = null;
      map.dispose();
    };
  }, [draftFeature, referenceFeature, savedAreas]);

  useEffect(() => {
    // 一覧が先に取得できても、詳細の図形があれば選択中のエリアにはそちらを表示する。
    const visible = selected ? [...areas.filter((area) => area.id !== selected.id), selected] : areas;
    savedAreas.clear();
    savedAreas.addFeatures(visible.filter((area) => area.id !== hiddenAreaId).map((area) => {
      const feature = new Feature(mapPolygon(area.geometry));
      feature.setId(area.id);
      if (area.id === selectedId) feature.setStyle(selectedStyle);
      return feature;
    }));
  }, [areas, hiddenAreaId, savedAreas, selected, selectedId]);

  useEffect(() => {
    // OpenLayersで編集した直後は同じFeatureを保ち、頂点の編集中に作り直さない。
    if (draft !== lastMapChange.current) draftFeature.setGeometry(draft && mapPolygon(draft));
  }, [draft, draftFeature]);

  useEffect(() => {
    referenceFeature.setGeometry(reference && mapPolygon(reference));
  }, [reference, referenceFeature]);

  useEffect(() => {
    drawRef.current?.setActive(mode === 'draw');
    modifyRef.current?.setActive(mode === 'modify');
  }, [mode]);

  const focusedArea = mode === 'view' ? selected : undefined;
  useEffect(() => {
    if (!focusedArea) return;
    mapRef.current?.getView().fit(mapPolygon(focusedArea.geometry), {
      padding: [40, 40, 40, 40], maxZoom: 9, duration: 200,
    });
  }, [focusedArea]);

  return (
    <div className={mode === 'draw' ? 'map-shell is-picking' : 'map-shell'}>
      <div ref={target} className="map-target" aria-label="担当エリア地図" tabIndex={0} />
      {tileError && <Alert severity="warning" className="map-warning">背景地図を取得できませんでした。</Alert>}
    </div>
  );
}
