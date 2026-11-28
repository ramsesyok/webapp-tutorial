import { latitudeLimit } from './places';

export type AreaGeometry = { type: 'Polygon'; coordinates: number[][][] };

export function polygonError(geometry: AreaGeometry) {
  if (geometry.coordinates.length !== 1) return '外周が1本の多角形を指定してください。';
  const [ring] = geometry.coordinates;
  if (ring.length < 4 || ring.length > 201) return '外周の頂点は3〜200点にしてください。';
  if (ring.some(([longitude, latitude]) => Math.abs(longitude) > 180 || Math.abs(latitude) > latitudeLimit)) {
    return '地図の範囲内の経度・緯度を指定してください。';
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return '外周の最初と最後の座標を同じにしてください。';
  const vertices = ring.slice(0, -1);
  if (new Set(vertices.map((point) => point.join(','))).size !== vertices.length) {
    return '外周に重複する頂点があります。';
  }

  // 保存する経緯度平面で、隣り合わない辺の交差や接触を調べる。
  for (const [index, start] of vertices.entries()) {
    const end = vertices[(index + 1) % vertices.length];
    if (Math.abs(start[0] - end[0]) > 180) return '日付変更線をまたがない範囲で描いてください。';
    const next = vertices[(index + 2) % vertices.length];
    if (crossProduct(start, end, next) === 0 && (withinSegment(start, end, next) || withinSegment(end, next, start))) {
      return '外周の辺が重なっています。';
    }
    for (let other = index + 2; other < vertices.length; other++) {
      if (index === 0 && other === vertices.length - 1) continue;
      if (segmentsIntersect(start, end, vertices[other], vertices[(other + 1) % vertices.length])) {
        return '外周の辺が交差しています。';
      }
    }
  }
  let twiceArea = 0;
  for (let index = 1; index + 1 < vertices.length; index++) {
    twiceArea += crossProduct(first, vertices[index], vertices[index + 1]);
  }
  return twiceArea === 0 ? '面積のある多角形を描いてください。' : '';
}

function crossProduct(start: number[], end: number[], point: number[]) {
  return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
}

function withinSegment(start: number[], end: number[], point: number[]) {
  return Math.min(start[0], end[0]) <= point[0] && point[0] <= Math.max(start[0], end[0]) &&
    Math.min(start[1], end[1]) <= point[1] && point[1] <= Math.max(start[1], end[1]);
}

function segmentsIntersect(a: number[], b: number[], c: number[], d: number[]) {
  const abC = crossProduct(a, b, c);
  const abD = crossProduct(a, b, d);
  const cdA = crossProduct(c, d, a);
  const cdB = crossProduct(c, d, b);
  return (abC === 0 && withinSegment(a, b, c)) || (abD === 0 && withinSegment(a, b, d)) ||
    (cdA === 0 && withinSegment(c, d, a)) || (cdB === 0 && withinSegment(c, d, b)) ||
    (oppositeSigns(abC, abD) && oppositeSigns(cdA, cdB));
}

function oppositeSigns(a: number, b: number) {
  return (a < 0 && b > 0) || (a > 0 && b < 0);
}
