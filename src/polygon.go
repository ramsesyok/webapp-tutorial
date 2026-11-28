package main

import "math"

type position [2]float64

func polygonError(polygon AreaPolygon) string {
	if polygon.Type != Polygon || len(polygon.Coordinates) != 1 {
		return "外周が1本の多角形を指定してください。"
	}
	ring := polygon.Coordinates[0]
	if len(ring) < 4 || len(ring) > 201 {
		return "外周の頂点は3〜200点にしてください。"
	}
	vertices := make([]position, len(ring)-1)
	seen := make(map[position]bool, len(vertices))
	for index, coordinates := range ring {
		if len(coordinates) != 2 || !withinCoordinateRange(coordinates[0], 180) || !withinCoordinateRange(coordinates[1], 85.051129) {
			return "地図の範囲内の経度・緯度を指定してください。"
		}
		point := position(coordinates)
		if index == len(vertices) {
			if point != vertices[0] {
				return "外周の最初と最後の座標を同じにしてください。"
			}
			break
		}
		if seen[point] {
			return "外周に重複する頂点があります。"
		}
		seen[point] = true
		vertices[index] = point
	}

	// GeoJSONに保存する経緯度平面上で、閉点を除いた頂点から辺を作る。
	for i, start := range vertices {
		end := vertices[(i+1)%len(vertices)]
		if math.Abs(start[0]-end[0]) > 180 {
			return "日付変更線をまたがない範囲で描いてください。"
		}
		next := vertices[(i+2)%len(vertices)]
		if crossProduct(start, end, next) == 0 &&
			(withinSegment(start, end, next) || withinSegment(end, next, start)) {
			return "外周の辺が重なっています。"
		}
		for j := i + 2; j < len(vertices); j++ {
			if i == 0 && j == len(vertices)-1 {
				continue // 最後の辺と最初の辺は頂点を共有する。
			}
			if segmentsIntersect(start, end, vertices[j], vertices[(j+1)%len(vertices)]) {
				return "外周の辺が交差しています。"
			}
		}
	}

	// 最初の頂点を基準に面積を求めると、小さな図形でも座標の大きさの影響を抑えられる。
	var twiceArea float64
	for i := 1; i+1 < len(vertices); i++ {
		twiceArea += crossProduct(vertices[0], vertices[i], vertices[i+1])
	}
	if twiceArea == 0 {
		return "面積のある多角形を描いてください。"
	}
	return ""
}

func withinCoordinateRange(value, limit float64) bool {
	return value >= -limit && value <= limit
}

func crossProduct(start, end, point position) float64 {
	return (end[0]-start[0])*(point[1]-start[1]) - (end[1]-start[1])*(point[0]-start[0])
}

func withinSegment(start, end, point position) bool {
	return math.Min(start[0], end[0]) <= point[0] && point[0] <= math.Max(start[0], end[0]) &&
		math.Min(start[1], end[1]) <= point[1] && point[1] <= math.Max(start[1], end[1])
}

func segmentsIntersect(a, b, c, d position) bool {
	abC := crossProduct(a, b, c)
	abD := crossProduct(a, b, d)
	cdA := crossProduct(c, d, a)
	cdB := crossProduct(c, d, b)
	return abC == 0 && withinSegment(a, b, c) || abD == 0 && withinSegment(a, b, d) ||
		cdA == 0 && withinSegment(c, d, a) || cdB == 0 && withinSegment(c, d, b) ||
		oppositeSigns(abC, abD) && oppositeSigns(cdA, cdB)
}

func oppositeSigns(a, b float64) bool {
	return a < 0 && b > 0 || a > 0 && b < 0
}
