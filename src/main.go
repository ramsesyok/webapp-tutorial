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
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	assets "github.com/ramsesyok/webapp-tutorial"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	middleware "github.com/oapi-codegen/nethttp-middleware"
	"github.com/swaggest/swgui/v5emb"
)

func main() {
	port := flag.Int("port", 8080, "HTTP port on 127.0.0.1")
	dbPath := flag.String("db", "places.sqlite", "SQLite database file")
	dist := flag.String("dist", "dist", "SPA build directory")
	spaOrigin := flag.String("spa-origin", "http://127.0.0.1:5173", "Allowed SPA origin for API writes")
	secureCookie := flag.Bool("secure-cookie", false, "Set Secure on session cookies when accessed via HTTPS")
	flag.Parse()
	if *port < 1 || *port > 65535 {
		log.Fatal("port must be between 1 and 65535")
	}

	origin, err := url.Parse(*spaOrigin)
	if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") ||
		origin.Hostname() == "" || *spaOrigin != origin.Scheme+"://"+origin.Host {
		log.Fatal("spa-origin must be an HTTP(S) origin, for example http://127.0.0.1:5173")
	}
	listenAddr := net.JoinHostPort("127.0.0.1", strconv.Itoa(*port))
	db, err := openDatabase(*dbPath, os.Getenv("TUTORIAL_INITIAL_PASSWORD"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	handler, err := newHandler(db, os.DirFS(*dist), []string{"http://" + listenAddr, *spaOrigin}, *secureCookie)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              listenAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Listening on http://%s (Swagger UI: /swagger/)", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func newHandler(db *sql.DB, dist fs.FS, allowedOrigins []string, secureCookie bool) (http.Handler, error) {
	spec, err := openapi3.NewLoader().LoadFromData(assets.OpenAPILevel4)
	if err != nil {
		return nil, fmt.Errorf("load OpenAPI: %w", err)
	}
	if err := spec.Validate(context.Background()); err != nil {
		return nil, fmt.Errorf("validate OpenAPI: %w", err)
	}
	session := sessionAPI{db: db, secureCookie: secureCookie}
	validate := middleware.OapiRequestValidatorWithOptions(spec, &middleware.Options{
		SilenceServersWarning: true, // The spec uses the relative server URL /api.
		Options: openapi3filter.Options{
			MultiError:         true,
			AuthenticationFunc: session.authenticate,
		},
		ErrorHandlerWithOpts: writeValidationError,
	})
	api := struct {
		placeAPI
		sessionAPI
		userAPI
		areaAPI
	}{placeAPI: placeAPI{db: db}, sessionAPI: session, userAPI: userAPI{db: db}, areaAPI: areaAPI{db: db}}
	apiRoutes := HandlerWithOptions(api, StdHTTPServerOptions{
		BaseURL:     "/api",
		Middlewares: []MiddlewareFunc{validate},
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			badRequest(w, err.Error())
		},
	})
	apiRoutes = prepareAPIRequests(allowedOrigins, apiRoutes)

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
		http.ServeContent(w, r, "openapi.yaml", time.Time{}, bytes.NewReader(assets.OpenAPILevel4))
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
