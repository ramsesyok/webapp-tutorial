package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestPlaceWriteValidation(t *testing.T) {
	const validBody = `{"name":"拠点","category":"nature","longitude":0,"latitude":0,"memo":""}`
	cases := []struct {
		name   string
		body   string
		fields []string
	}{
		{
			name:   "coordinate out of range and missing memo",
			body:   `{"name":"拠点","category":"nature","longitude":0,"latitude":100}`,
			fields: []string{"latitude", "memo"},
		},
		{
			name:   "Unicode whitespace name and invalid category",
			body:   `{"name":"\t\u3000\u0085","category":"other","longitude":0,"latitude":0,"memo":""}`,
			fields: []string{"name", "category"},
		},
		{
			name:   "out of range longitude and wrong latitude type",
			body:   `{"name":"拠点","category":"nature","longitude":-181,"latitude":"0","memo":""}`,
			fields: []string{"longitude", "latitude"},
		},
		{
			name:   "null latitude and overlong name and memo",
			body:   `{"name":"` + strings.Repeat("拠", 81) + `","category":"nature","longitude":0,"latitude":null,"memo":"` + strings.Repeat("メ", 501) + `"}`,
			fields: []string{"name", "latitude", "memo"},
		},
		{
			name:   "missing required properties",
			body:   `{}`,
			fields: []string{"name", "category", "longitude", "latitude", "memo"},
		},
		{name: "malformed JSON", body: `{`},
		{name: "multiple JSON values", body: validBody + ` {}`},
		{name: "array body", body: `[]`},
		{name: "empty body"},
	}
	for _, endpoint := range []struct {
		method  string
		path    string
		success int
	}{
		{http.MethodPost, "/api/places", http.StatusCreated},
		{http.MethodPut, "/api/places/1", http.StatusOK},
	} {
		t.Run(endpoint.method, func(t *testing.T) {
			db, err := openDatabase(":memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			handler, err := newHandler(db, fstest.MapFS{})
			if err != nil {
				t.Fatal(err)
			}
			before := placeRequest(handler, http.MethodGet, "/api/places/1", "").Body.String()
			for _, test := range cases {
				t.Run(test.name, func(t *testing.T) {
					response := placeRequest(handler, endpoint.method, endpoint.path, test.body)
					if response.Code != http.StatusBadRequest {
						t.Fatalf("status = %d, want 400: %s", response.Code, response.Body)
					}
					var payload Error
					if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
						t.Fatal(err)
					}
					if payload.Code != INVALIDINPUT || payload.Message == "" {
						t.Fatalf("unexpected error: %s", response.Body)
					}
					if len(test.fields) == 0 {
						if payload.FieldErrors != nil {
							t.Errorf("fieldErrors must be omitted: %s", response.Body)
						}
						return
					}
					if payload.FieldErrors == nil || len(*payload.FieldErrors) != len(test.fields) {
						t.Fatalf("want field errors for %v: %s", test.fields, response.Body)
					}
					for _, field := range test.fields {
						if (*payload.FieldErrors)[field] == "" {
							t.Errorf("missing reason for %q: %s", field, response.Body)
						}
					}
				})
			}

			var count int
			if err := db.QueryRow("SELECT COUNT(*) FROM places").Scan(&count); err != nil {
				t.Fatal(err)
			}
			if after := placeRequest(handler, http.MethodGet, "/api/places/1", "").Body.String(); count != 3 || after != before {
				t.Fatalf("invalid requests changed the data: count = %d, place = %s", count, after)
			}

			boundaryBody := `{"name":"拠点","category":"nature","longitude":180,"latitude":-85.051129,"memo":"","LATITUDE":100}`
			response := placeRequest(handler, endpoint.method, endpoint.path, boundaryBody)
			if response.Code != endpoint.success {
				t.Fatalf("status = %d, want %d: %s", response.Code, endpoint.success, response.Body)
			}
			var place Place
			if err := json.Unmarshal(response.Body.Bytes(), &place); err != nil {
				t.Fatal(err)
			}
			if place.Longitude != 180 || place.Latitude != -85.051129 {
				t.Errorf("unexpected saved coordinates: %s", response.Body)
			}
		})
	}
}

func placeRequest(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
