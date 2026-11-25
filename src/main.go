package main

import (
	"bytes"
	"context"
	"database/sql"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	assets "github.com/ramsesyok/webapp-tutorial"

	"github.com/getkin/kin-openapi/openapi3"
	middleware "github.com/oapi-codegen/nethttp-middleware"
	"github.com/swaggest/swgui/v5emb"
)

func main() {
	port := flag.Int("port", 8080, "HTTP port on 127.0.0.1")
	dbPath := flag.String("db", "places.sqlite", "SQLite database file")
	dist := flag.String("dist", "dist", "SPA build directory")
	flag.Parse()
	if *port < 1 || *port > 65535 {
		log.Fatal("port must be between 1 and 65535")
	}

	db, err := openDatabase(*dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	handler, err := newHandler(db, os.DirFS(*dist))
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              net.JoinHostPort("127.0.0.1", strconv.Itoa(*port)),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Listening on http://%s (Swagger UI: /swagger/)", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func newHandler(db *sql.DB, dist fs.FS) (http.Handler, error) {
	spec, err := openapi3.NewLoader().LoadFromData(assets.OpenAPI)
	if err != nil {
		return nil, fmt.Errorf("load OpenAPI: %w", err)
	}
	if err := spec.Validate(context.Background()); err != nil {
		return nil, fmt.Errorf("validate OpenAPI: %w", err)
	}
	validate := middleware.OapiRequestValidatorWithOptions(spec, &middleware.Options{
		SilenceServersWarning: true, // The spec uses the relative server URL /api.
		ErrorHandler: func(w http.ResponseWriter, message string, _ int) {
			badRequest(w, message)
		},
	})
	apiRoutes := HandlerWithOptions(placeAPI{db: db}, StdHTTPServerOptions{
		BaseURL:     "/api",
		Middlewares: []MiddlewareFunc{validate},
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			badRequest(w, err.Error())
		},
	})

	mux := http.NewServeMux()
	mux.Handle("/api/", apiRoutes)
	mux.Handle("/api", apiRoutes)
	mux.Handle("/map/", http.NotFoundHandler())
	mux.HandleFunc("GET /map/world.pmtiles", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeContent(w, r, "world.pmtiles", time.Time{}, bytes.NewReader(assets.WorldMap))
	})
	mux.HandleFunc("GET /swagger/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		http.ServeContent(w, r, "openapi.yaml", time.Time{}, bytes.NewReader(assets.OpenAPI))
	})
	mux.Handle("GET /swagger/", v5emb.New(spec.Info.Title, "/swagger/openapi.yaml", "/swagger/"))
	mux.Handle("/", spaHandler(dist))
	return mux, nil
}

func spaHandler(dist fs.FS) http.Handler {
	files := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		name := strings.TrimPrefix(r.URL.Path, "/")
		if info, err := fs.Stat(dist, name); err == nil && info.Mode().IsRegular() {
			files.ServeHTTP(w, r)
			return
		}
		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}

		// Client-side routes start from the same index page.
		indexRequest := r.Clone(r.Context())
		indexRequest.URL.Path = "/"
		indexRequest.URL.RawPath = ""
		if info, err := fs.Stat(dist, "index.html"); err == nil && info.Mode().IsRegular() {
			files.ServeHTTP(w, indexRequest)
			return
		}
		http.Error(w, "SPA not found. Build it and place its files in dist.", http.StatusNotFound)
	})
}
