// Package assets embeds the files shared by the backend and the tutorial.
package assets

import _ "embed"

//go:embed map/world.pmtiles
var WorldMap []byte

//go:embed schema/level0/openapi.yaml
var OpenAPI []byte
