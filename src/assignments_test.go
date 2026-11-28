package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"
)

func TestLevel3AssignmentLifecycle(t *testing.T) {
	db, err := openDatabase(":memory:", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler, err := newHandler(db, fstest.MapFS{}, []string{testViteOrigin}, false)
	if err != nil {
		t.Fatal(err)
	}
	admin := loginForTest(t, handler, nil)
	const assigneeLogin = `{"loginId":"berlin","password":"` + testPassword + `"}`
	const placeInput = `{"name":"担当拠点","category":"sightseeing","longitude":0,"latitude":0,"memo":""}`
	send := func(cookie *http.Cookie, method, path, body string) *httptest.ResponseRecorder {
		return apiRequest(handler, method, "/api"+path, body, testViteOrigin, cookie)
	}
	var adminUser User
	readAPIResponse(t, send(admin, "GET", "/session", ""), http.StatusOK, &adminUser)
	if adminUser.Role != Admin || !adminUser.Active {
		t.Fatalf("unexpected admin %+v", adminUser)
	}

	var assignee User
	readAPIResponse(t, send(admin, "POST", "/users", assigneeLogin), http.StatusCreated, &assignee)
	if assignee.Role != Assignee || !assignee.Active {
		t.Fatalf("unexpected assignee %+v", assignee)
	}
	requireAPIError(t, send(admin, "POST", "/users", assigneeLogin), http.StatusConflict, LOGINIDTAKEN)
	login := send(nil, "POST", "/session", assigneeLogin)
	if login.Code != http.StatusOK || len(login.Result().Cookies()) != 1 {
		t.Fatalf("assignee login failed: %d %s", login.Code, login.Body)
	}
	cookie := login.Result().Cookies()[0]
	assignment := fmt.Sprintf(`{"assigneeId":%d}`, assignee.Id)
	disablePath := fmt.Sprintf("/users/%d/disabled", assignee.Id)

	var places []PlaceSummary
	readAPIResponse(t, send(cookie, "GET", "/places", ""), http.StatusOK, &places)
	if places == nil || len(places) != 0 {
		t.Fatalf("want empty place list, got %+v", places)
	}
	for _, op := range []struct{ method, path, body string }{
		{"GET", "/users", ""},
		{"POST", "/users", assigneeLogin},
		{"PUT", disablePath, ""},
		{"GET", "/places/1", ""},
		{"PUT", "/places/1", placeInput},
		{"GET", "/places/1/assignment-history", ""},
		{"PUT", "/places/1/assignee", assignment},
		{"POST", "/places", placeInput},
		{"DELETE", "/places/1", ""},
	} {
		requireAPIError(t, send(cookie, op.method, op.path, op.body), http.StatusForbidden, FORBIDDEN)
	}
	requireAPIError(t, send(admin, "PUT", "/places/1/assignee", `{}`), http.StatusBadRequest, INVALIDINPUT)
	requireAPIError(t, send(admin, "PUT", "/places/1/assignee", `{"assigneeId":999}`), http.StatusBadRequest, INVALIDINPUT)
	requireAPIError(t, send(admin, "PUT", "/users/1/disabled", ""), http.StatusForbidden, FORBIDDEN)

	var place Place
	readAPIResponse(t, send(admin, "PUT", "/places/1/assignee", assignment), http.StatusOK, &place)
	if place.AssigneeId == nil || *place.AssigneeId != assignee.Id {
		t.Fatalf("unexpected assignment %+v", place)
	}
	readAPIResponse(t, send(admin, "PUT", "/places/1/assignee", assignment), http.StatusOK, &place)
	readAPIResponse(t, send(cookie, "GET", "/places", ""), http.StatusOK, &places)
	if len(places) != 1 || places[0].Id != 1 {
		t.Fatalf("unexpected assigned places %+v", places)
	}
	readAPIResponse(t, send(cookie, "GET", "/places?q=動物園", ""), http.StatusOK, &places)
	if len(places) != 0 {
		t.Fatalf("search returned unassigned places %+v", places)
	}
	readAPIResponse(t, send(cookie, "GET", "/places/1", ""), http.StatusOK, &place)
	readAPIResponse(t, send(cookie, "PUT", "/places/1", placeInput), http.StatusOK, &place)
	if place.Name != "担当拠点" || place.AssigneeId == nil || *place.AssigneeId != assignee.Id {
		t.Fatalf("unexpected updated place %+v", place)
	}
	requireAPIError(t, send(cookie, "PUT", "/places/2", placeInput), http.StatusForbidden, FORBIDDEN)

	var history []AssignmentChange
	readAPIResponse(t, send(cookie, "GET", "/places/1/assignment-history", ""), http.StatusOK, &history)
	if len(history) != 1 || history[0].PreviousAssigneeLoginId != nil ||
		history[0].NewAssigneeLoginId == nil || *history[0].NewAssigneeLoginId != assignee.LoginId ||
		history[0].ActorLoginId != initialLoginID || history[0].ChangedAt.IsZero() {
		t.Fatalf("unexpected history %+v", history)
	}

	readAPIResponse(t, send(admin, "PUT", disablePath, ""), http.StatusNoContent, nil)
	readAPIResponse(t, send(admin, "PUT", disablePath, ""), http.StatusNoContent, nil)
	requireAPIError(t, send(cookie, "GET", "/session", ""), http.StatusUnauthorized, UNAUTHENTICATED)
	requireAPIError(t, send(nil, "POST", "/session", assigneeLogin), http.StatusUnauthorized, INVALIDCREDENTIALS)
	requireAPIError(t, send(admin, "PUT", "/places/2/assignee", assignment), http.StatusBadRequest, INVALIDINPUT)

	// If the history insert fails, SQLite must also undo the assignment update.
	if _, err := db.Exec(`
		CREATE TRIGGER reject_history BEFORE INSERT ON assignment_history
		BEGIN SELECT RAISE(ABORT, 'history insert failed'); END;
	`); err != nil {
		t.Fatal(err)
	}
	readAPIResponse(t, send(admin, "PUT", "/places/1/assignee", `{"assigneeId":null}`), http.StatusInternalServerError, nil)
	readAPIResponse(t, send(admin, "GET", "/places/1", ""), http.StatusOK, &place)
	if place.AssigneeId == nil || *place.AssigneeId != assignee.Id {
		t.Fatalf("assignment changed despite failed history insert %+v", place)
	}
	if _, err := db.Exec("DROP TRIGGER reject_history"); err != nil {
		t.Fatal(err)
	}
	readAPIResponse(t, send(admin, "PUT", "/places/1/assignee", `{"assigneeId":null}`), http.StatusOK, &place)
	if place.AssigneeId != nil {
		t.Fatalf("assignment was not cleared %+v", place)
	}
	readAPIResponse(t, send(admin, "GET", "/places/1/assignment-history", ""), http.StatusOK, &history)
	if len(history) != 2 || history[0].PreviousAssigneeLoginId == nil ||
		*history[0].PreviousAssigneeLoginId != assignee.LoginId || history[0].NewAssigneeLoginId != nil ||
		history[0].Id <= history[1].Id {
		t.Fatalf("unexpected history after unassignment %+v", history)
	}
}

func TestLevel2DatabaseMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "places.sqlite")
	oldDB, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = oldDB.Exec(`
		CREATE TABLE places (
			id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
			longitude REAL NOT NULL, latitude REAL NOT NULL, memo TEXT NOT NULL
		);
		CREATE TABLE users (
			id INTEGER PRIMARY KEY, login_id TEXT NOT NULL UNIQUE, password_salt BLOB NOT NULL, password_hash BLOB NOT NULL
		);
		CREATE TABLE sessions (
			token_hash BLOB PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
		);
		INSERT INTO places VALUES (4, 'レベル2の拠点', 'nature', 0, 0, '');
		PRAGMA user_version = 2;
	`)
	if err != nil {
		oldDB.Close()
		t.Fatal(err)
	}
	salt, hash, err := newPasswordHash(testPassword)
	if err != nil {
		oldDB.Close()
		t.Fatal(err)
	}
	token := randomToken(sessionTokenBytes)
	cookie := &http.Cookie{Name: sessionCookieName, Value: token}
	request := httptest.NewRequest("GET", "/api/session", nil)
	request.AddCookie(cookie)
	tokenHash, _ := readSessionTokenHash(request)
	_, err = oldDB.Exec(`
		INSERT INTO users VALUES (7, ?, ?, ?);
		INSERT INTO sessions VALUES (?, 7, ?);
	`, initialLoginID, salt, hash, tokenHash[:], time.Now().Add(time.Hour).Unix())
	oldDB.Close()
	if err != nil {
		t.Fatal(err)
	}

	db, err := openDatabase(path, "")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler, err := newHandler(db, fstest.MapFS{}, []string{testViteOrigin}, false)
	if err != nil {
		t.Fatal(err)
	}
	requireAPIError(t, apiRequest(handler, "GET", "/api/session", "", "", cookie), http.StatusUnauthorized, UNAUTHENTICATED)
	admin := loginForTest(t, handler, nil)
	var user User
	readAPIResponse(t, apiRequest(handler, "GET", "/api/session", "", "", admin), http.StatusOK, &user)
	if user.Id != 7 || user.Role != Admin {
		t.Fatalf("unexpected migrated user %+v", user)
	}
	var place Place
	readAPIResponse(t, apiRequest(handler, "GET", "/api/places/4", "", "", admin), http.StatusOK, &place)
	if place.Name != "レベル2の拠点" || place.AssigneeId != nil {
		t.Fatalf("unexpected migrated place %+v", place)
	}
}

func readAPIResponse(t *testing.T, response *httptest.ResponseRecorder, status int, body any) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("want status %d, got %d: %s", status, response.Code, response.Body)
	}
	if body != nil {
		if err := json.Unmarshal(response.Body.Bytes(), body); err != nil {
			t.Fatalf("decode response %s: %v", response.Body, err)
		}
	}
}
