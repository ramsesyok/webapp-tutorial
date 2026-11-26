package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

const (
	testViteOrigin    = "http://127.0.0.1:5173"
	testSwaggerOrigin = "http://127.0.0.1:8080"
	testPassword      = "tutorial-test-password"
	testLoginBody     = `{"loginId":"student","password":"` + testPassword + `"}`
)

func TestSessionLifecycle(t *testing.T) {
	db, err := openDatabase(":memory:", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler, err := newHandler(db, fstest.MapFS{}, []string{testSwaggerOrigin, testViteOrigin}, false)
	if err != nil {
		t.Fatal(err)
	}

	for _, operation := range []struct{ method, path string }{
		{http.MethodGet, "/api/session"},
		{http.MethodDelete, "/api/session"},
		{http.MethodGet, "/api/places"},
		{http.MethodGet, "/api/places/1"},
		{http.MethodPost, "/api/places"},
		{http.MethodPut, "/api/places/1"},
		{http.MethodDelete, "/api/places/1"},
	} {
		response := apiRequest(handler, operation.method, operation.path, "", testViteOrigin, nil)
		requireAPIError(t, response, http.StatusUnauthorized, UNAUTHENTICATED)
	}

	for _, body := range []string{
		`{"loginId":"student","password":"wrong"}`,
		`{"loginId":"unknown","password":"` + testPassword + `"}`,
	} {
		response := apiRequest(handler, http.MethodPost, "/api/session", body, testViteOrigin, nil)
		requireAPIError(t, response, http.StatusUnauthorized, INVALIDCREDENTIALS)
		if response.Header().Get("Set-Cookie") != "" {
			t.Fatal("failed login set a cookie")
		}
	}

	for _, origin := range []string{"", "http://127.0.0.1:5174", "https://example.invalid"} {
		response := apiRequest(handler, http.MethodPost, "/api/session", testLoginBody, origin, nil)
		requireAPIError(t, response, http.StatusForbidden, INVALIDORIGIN)
	}

	cookie := loginForTest(t, handler, nil)
	if !cookie.HttpOnly || cookie.Secure || cookie.SameSite != http.SameSiteLaxMode ||
		cookie.Domain != "" || cookie.Path != "/api" || cookie.MaxAge != int(sessionLifetime/time.Second) {
		t.Fatal("unexpected session cookie attributes")
	}
	response := apiRequest(handler, http.MethodGet, "/api/session", "", "", cookie)
	var user User
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &user) != nil ||
		user.Id != 1 || user.LoginId != initialLoginID || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unexpected session response: %d %s", response.Code, response.Body)
	}

	// Re-login rotates the cookie and revokes the previous session.
	current := loginForTest(t, handler, cookie)
	response = apiRequest(handler, http.MethodGet, "/api/session", "", "", cookie)
	requireAPIError(t, response, http.StatusUnauthorized, UNAUTHENTICATED)

	response = apiRequest(handler, http.MethodDelete, "/api/session", "", "https://example.invalid", current)
	requireAPIError(t, response, http.StatusForbidden, INVALIDORIGIN)
	response = apiRequest(handler, http.MethodGet, "/api/places/1", "", "", current)
	if response.Code != http.StatusOK {
		t.Fatalf("authenticated place request: %d %s", response.Code, response.Body)
	}

	response = apiRequest(handler, http.MethodDelete, "/api/session", "", testSwaggerOrigin, current)
	cookies := response.Result().Cookies()
	if response.Code != http.StatusNoContent || len(cookies) != 1 ||
		cookies[0].Name != sessionCookieName || cookies[0].Path != "/api" || cookies[0].MaxAge >= 0 {
		t.Fatalf("unexpected logout response: %d %s", response.Code, response.Body)
	}
	response = apiRequest(handler, http.MethodGet, "/api/places/1", "", "", current)
	requireAPIError(t, response, http.StatusUnauthorized, UNAUTHENTICATED)

	expired := loginForTest(t, handler, nil)
	if _, err := db.Exec("UPDATE sessions SET expires_at = ?", time.Now().Unix()-1); err != nil {
		t.Fatal(err)
	}
	response = apiRequest(handler, http.MethodGet, "/api/session", "", "", expired)
	requireAPIError(t, response, http.StatusUnauthorized, UNAUTHENTICATED)
}

func TestLevel1DatabaseMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "places.sqlite")
	level1, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = level1.Exec(`
		CREATE TABLE places (
			id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
			longitude REAL NOT NULL, latitude REAL NOT NULL, memo TEXT NOT NULL
		);
		INSERT INTO places VALUES (4, 'レベル1の拠点', 'nature', 0, 0, '');
		PRAGMA user_version = 1;
	`)
	level1.Close()
	if err != nil {
		t.Fatal(err)
	}
	db, err := openDatabase(path, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler, err := newHandler(db, fstest.MapFS{}, []string{testViteOrigin}, false)
	if err != nil {
		t.Fatal(err)
	}
	cookie := loginForTest(t, handler, nil)
	response := apiRequest(handler, http.MethodGet, "/api/places", "", "", cookie)
	var places []PlaceSummary
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &places) != nil ||
		len(places) != 1 || places[0].Id != 4 || places[0].Name != "レベル1の拠点" {
		t.Fatalf("unexpected places after migration: %d %s", response.Code, response.Body)
	}
}

func loginForTest(t *testing.T, handler http.Handler, previous *http.Cookie) *http.Cookie {
	t.Helper()
	response := apiRequest(handler, http.MethodPost, "/api/session", testLoginBody, testViteOrigin, previous)
	cookies := response.Result().Cookies()
	if response.Code != http.StatusOK || len(cookies) != 1 || cookies[0].Name != sessionCookieName || cookies[0].Value == "" {
		t.Fatalf("login failed: %d %s", response.Code, response.Body)
	}
	return cookies[0]
}

func apiRequest(handler http.Handler, method, path, body, origin string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func requireAPIError(t *testing.T, response *httptest.ResponseRecorder, status int, code ErrorCode) {
	t.Helper()
	var payload Error
	if response.Code != status || json.Unmarshal(response.Body.Bytes(), &payload) != nil || payload.Code != code {
		t.Fatalf("want %d with code %s, got %d: %s", status, code, response.Code, response.Body)
	}
}
