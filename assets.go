// Package assets embeds the files shared by the backend and the tutorial.
package assets

import _ "embed"

//go:embed map/world.pmtiles
var WorldMap []byte

//go:embed schema/openapi.yaml
var OpenAPI []byte

//go:embed schema/level1/openapi.yaml
var OpenAPILevel1 []byte

//go:embed schema/level2/openapi.yaml
var OpenAPILevel2 []byte
