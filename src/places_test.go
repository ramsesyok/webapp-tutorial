package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestCreateRejectsUnicodeWhitespaceName(t *testing.T) {
	db, err := openDatabase(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	handler, err := newHandler(db, fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	body := strings.NewReader(`{"name":"\u3000","category":"nature","longitude":0,"latitude":0,"memo":""}`)
	request := httptest.NewRequest(http.MethodPost, "/api/places", body)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: %s", response.Code, response.Body)
	}
	var payload Error
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Code != INVALIDINPUT {
		t.Errorf("error code = %q, want %q", payload.Code, INVALIDINPUT)
	}
}
