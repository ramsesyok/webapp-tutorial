package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAreaEditing(t *testing.T) {
	db, err := openDatabase(":memory:", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler, err := newHandler(db, fstest.MapFS{}, []string{testViteOrigin}, false)
	if err != nil {
		t.Fatal(err)
	}
	send := func(cookie *http.Cookie, method, path, body string, tags ...string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
		request.Header.Set("Origin", testViteOrigin)
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			request.AddCookie(cookie)
		}
		for _, tag := range tags {
			request.Header.Add("If-Match", tag)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	admin := loginForTest(t, handler, nil)
	createAssignee := func(loginID string) (User, *http.Cookie) {
		body := fmt.Sprintf(`{"loginId":%q,"password":%q}`, loginID, testPassword)
		var user User
		readAPIResponse(t, send(admin, "POST", "/users", body), http.StatusCreated, &user)
		response := send(nil, "POST", "/session", body)
		readAPIResponse(t, response, http.StatusOK, nil)
		return user, response.Result().Cookies()[0]
	}
	assignee, assigneeCookie := createAssignee("berlin")
	other, otherCookie := createAssignee("other")

	const triangle = `[[[13.35,52.50],[13.41,52.50],[13.38,52.54],[13.35,52.50]]]`
	areaInput := func(name string, id UserId, coordinates string) string {
		return fmt.Sprintf(`{"name":%q,"assigneeId":%d,"geometry":{"type":"Polygon","coordinates":%s}}`, name, id, coordinates)
	}
	valid := areaInput("ベルリン", assignee.Id, triangle)
	requireAPIError(t, send(nil, "GET", "/areas", ""), http.StatusUnauthorized, UNAUTHENTICATED)
	requireAPIError(t, send(assigneeCookie, "POST", "/areas", valid), http.StatusForbidden, FORBIDDEN)
	rejected := send(admin, "POST", "/areas", areaInput("ベルリン", 999, triangle))
	requireAreaFieldError(t, rejected, "assigneeId")

	for name, coordinates := range map[string]string{
		"open ring":     `[[[0,0],[1,0],[1,1],[0,1]]]`,
		"duplicate":     `[[[0,0],[1,0],[1,1],[1,0],[0,0]]]`,
		"intersection":  `[[[0,0],[2,2],[0,2],[2,0],[0,0]]]`,
		"touch":         `[[[0,0],[2,0],[2,2],[1,0],[0,2],[0,0]]]`,
		"overlap":       `[[[0,0],[2,0],[1,0],[2,2],[0,0]]]`,
		"zero area":     `[[[0,0],[1,1],[2,2],[0,0]]]`,
		"latitude":      `[[[0,0],[1,0],[1,86],[0,0]]]`,
		"longitude":     `[[[181,0],[1,0],[1,1],[181,0]]]`,
		"antimeridian":  `[[[179,0],[-179,0],[179,1],[179,0]]]`,
		"altitude":      `[[[0,0,3],[1,0],[1,1],[0,0]]]`,
		"interior ring": `[[[0,0],[2,0],[2,2],[0,0]],[[1,0.5],[1.5,0.5],[1.5,1],[1,0.5]]]`,
	} {
		t.Run(name, func(t *testing.T) {
			requireAreaFieldError(t, send(admin, "POST", "/areas", areaInput(name, assignee.Id, coordinates)), "geometry")
		})
	}
	var areas []Area
	readAPIResponse(t, send(admin, "GET", "/areas", ""), http.StatusOK, &areas)
	if len(areas) != 0 {
		t.Fatalf("invalid area was saved: %+v", areas)
	}

	created := send(admin, "POST", "/areas", valid)
	var area Area
	readAPIResponse(t, created, http.StatusCreated, &area)
	path := fmt.Sprintf("/areas/%d", area.Id)
	etag := fmt.Sprintf(`"area-%d-v1"`, area.Id)
	if created.Header().Get("ETag") != etag || created.Header().Get("Location") != "/api"+path ||
		area.AssigneeId != assignee.Id || len(area.Geometry.Coordinates) != 1 {
		t.Fatalf("unexpected create response: %v %+v", created.Header(), area)
	}
	own := send(assigneeCookie, "GET", path, "")
	readAPIResponse(t, own, http.StatusOK, &area)
	if own.Header().Get("ETag") != etag || own.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unexpected detail headers: %v", own.Header())
	}
	readAPIResponse(t, send(assigneeCookie, "GET", "/areas", ""), http.StatusOK, &areas)
	if len(areas) != 1 || areas[0].Id != area.Id {
		t.Fatalf("unexpected assigned areas %+v", areas)
	}
	readAPIResponse(t, send(otherCookie, "GET", "/areas", ""), http.StatusOK, &areas)
	if areas == nil || len(areas) != 0 {
		t.Fatalf("want empty area list, got %+v", areas)
	}
	requireAPIError(t, send(otherCookie, "GET", path, ""), http.StatusForbidden, FORBIDDEN)
	requireAPIError(t, send(otherCookie, "PUT", path, valid, etag), http.StatusForbidden, FORBIDDEN)
	requireAPIError(t, send(assigneeCookie, "PUT", path, areaInput("ベルリン", other.Id, triangle), etag), http.StatusForbidden, FORBIDDEN)
	requireAPIError(t, send(admin, "GET", "/areas/999", ""), http.StatusNotFound, AREANOTFOUND)
	requireAPIError(t, send(admin, "PUT", "/areas/999", valid, etag), http.StatusNotFound, AREANOTFOUND)
	for _, tags := range [][]string{nil, {"*"}, {`W/"area-1-v1"`}, {etag + "," + etag}, {etag, etag}} {
		requireAPIError(t, send(assigneeCookie, "PUT", path, valid, tags...), http.StatusBadRequest, INVALIDINPUT)
	}

	// 同じタグの更新を並行で送り、どちらか片方だけが保存されることを確認する。
	start := make(chan struct{})
	replies := make(chan *httptest.ResponseRecorder, 2)
	for _, name := range []string{"西側", "東側"} {
		go func() {
			<-start
			replies <- send(assigneeCookie, "PUT", path, areaInput(name, assignee.Id, triangle), etag)
		}()
	}
	close(start)
	var saved Area
	statuses := make(map[int]int)
	nextETag := fmt.Sprintf(`"area-%d-v2"`, area.Id)
	for range 2 {
		response := <-replies
		statuses[response.Code]++
		switch response.Code {
		case http.StatusOK:
			readAPIResponse(t, response, http.StatusOK, &saved)
			if response.Header().Get("ETag") != nextETag {
				t.Fatalf("want %s, got %v", nextETag, response.Header())
			}
		case http.StatusPreconditionFailed:
			requireAPIError(t, response, http.StatusPreconditionFailed, AreaVersionMismatch)
		default:
			t.Fatalf("unexpected update response %d: %s", response.Code, response.Body)
		}
	}
	if statuses[http.StatusOK] != 1 || statuses[http.StatusPreconditionFailed] != 1 {
		t.Fatalf("expected one save and one conflict: %v", statuses)
	}
	latest := send(assigneeCookie, "GET", path, "")
	readAPIResponse(t, latest, http.StatusOK, &area)
	if latest.Header().Get("ETag") != nextETag || area.Name != saved.Name {
		t.Fatalf("unexpected saved state: %+v %v", area, latest.Header())
	}
	requireAPIError(t, send(admin, "PUT", path, valid, `"area-999-v2"`), http.StatusPreconditionFailed, AreaVersionMismatch)
	readAPIResponse(t, send(admin, "PUT", path, areaInput(area.Name, other.Id, triangle), nextETag), http.StatusOK, &area)
	requireAPIError(t, send(assigneeCookie, "GET", path, ""), http.StatusForbidden, FORBIDDEN)
	readAPIResponse(t, send(otherCookie, "GET", path, ""), http.StatusOK, &area)
}

func requireAreaFieldError(t *testing.T, response *httptest.ResponseRecorder, field string) {
	t.Helper()
	requireAPIError(t, response, http.StatusBadRequest, INVALIDINPUT)
	var body Error
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.FieldErrors == nil || (*body.FieldErrors)[field] == "" {
		t.Fatalf("want error for %s, got %s", field, response.Body)
	}
}

func TestAreaSPAEntry(t *testing.T) {
	const index = "<!doctype html><title>担当エリア</title>"
	handler := spaHandler(fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(index)}})
	for _, path := range []string{"/", "/areas?area=4"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != http.StatusOK || response.Body.String() != index {
			t.Fatalf("unexpected SPA response for %s: %d %s", path, response.Code, response.Body)
		}
	}
}

func TestLevel3DatabaseMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "areas.sqlite")
	previous, err := openDatabase(path, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	_, prepareErr := previous.Exec(`
		INSERT INTO users (id, login_id, password_salt, password_hash, role)
		VALUES (2, '担当者', X'00', X'00', 'assignee');
		UPDATE places SET assignee_id = 2 WHERE id = 1;
		INSERT INTO assignment_history (place_id, new_assignee_id, actor_id, changed_at)
		VALUES (1, 2, 1, '2026-01-01T00:00:00Z');
		DROP TABLE areas;
		PRAGMA user_version = 3;
	`)
	previous.Close()
	if prepareErr != nil {
		t.Fatal(prepareErr)
	}
	migrated, err := openDatabase(path, "")
	if err != nil {
		t.Fatal(err)
	}
	defer migrated.Close()
	for query, want := range map[string]int{
		"PRAGMA user_version":                                             4,
		"SELECT count(*) FROM areas":                                      0,
		"SELECT assignee_id FROM places WHERE id = 1":                     2,
		"SELECT count(*) FROM users WHERE id = 2 AND role = 'assignee'":   1,
		"SELECT new_assignee_id FROM assignment_history WHERE place_id=1": 2,
	} {
		var got int
		if err := migrated.QueryRow(query).Scan(&got); err != nil || got != want {
			t.Fatalf("%s: want %d, got %d (%v)", query, want, got, err)
		}
	}
}
