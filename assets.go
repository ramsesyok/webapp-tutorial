// Package assets embeds the files shared by the backend and the tutorial.
package assets

import _ "embed"

//go:embed map/world.pmtiles
var WorldMap []byte

//go:embed schema/openapi.yaml
var OpenAPI []byte
