package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

type placeAPI struct {
	db *sql.DB
}

type placeReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readAccessiblePlace(r *http.Request, db placeReader, id PlaceId) (Place, error) {
	place, err := scanPlace(db.QueryRowContext(r.Context(), `
		SELECT id, name, category, longitude, latitude, memo, assignee_id FROM places WHERE id = ?
	`, id))
	if err != nil {
		return Place{}, err
	}
	user := requestSession(r).user
	if user.Role != Admin && (place.AssigneeId == nil || *place.AssigneeId != user.Id) {
		return Place{}, errForbidden
	}
	return place, nil
}

func (api placeAPI) ListPlaces(w http.ResponseWriter, r *http.Request, params ListPlacesParams) {
	var keyword string
	if params.Q != nil {
		keyword = strings.TrimSpace(*params.Q)
	}
	var category Category
	if params.Category != nil {
		category = *params.Category
	}

	user := requestSession(r).user
	// SQLite lower() folds ASCII, and instr() treats characters such as % literally.
	rows, err := api.db.QueryContext(r.Context(), `
		SELECT id, name, category, longitude, latitude, assignee_id
		FROM places
		WHERE (? = '' OR instr(lower(name), lower(?)) > 0 OR instr(lower(memo), lower(?)) > 0)
		  AND (? = '' OR category = ?)
		  AND (? OR assignee_id = ?)
		ORDER BY id
	`, keyword, keyword, keyword, category, category, user.Role == Admin, user.Id)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer rows.Close()

	places := []PlaceSummary{}
	for rows.Next() {
		var place PlaceSummary
		if err := rows.Scan(&place.Id, &place.Name, &place.Category, &place.Longitude, &place.Latitude, &place.AssigneeId); err != nil {
			databaseError(w, err)
			return
		}
		places = append(places, place)
	}
	if err := rows.Err(); err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, places)
}

func (api placeAPI) GetPlace(w http.ResponseWriter, r *http.Request, id PlaceId) {
	place, err := readAccessiblePlace(r, api.db, id)
	if err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, place)
}

func (api placeAPI) CreatePlace(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	input, err := readPlaceInput(r)
	if err != nil {
		badRequest(w, invalidJSONBody)
		return
	}
	place, err := scanPlace(api.db.QueryRowContext(r.Context(), `
		INSERT INTO places (name, category, longitude, latitude, memo)
		VALUES (?, ?, ?, ?, ?)
		RETURNING id, name, category, longitude, latitude, memo, assignee_id
	`, input.Name, input.Category, input.Longitude, input.Latitude, input.Memo))
	if err != nil {
		databaseError(w, err)
		return
	}
	w.Header().Set("Location", fmt.Sprintf("/api/places/%d", place.Id))
	writeJSON(w, http.StatusCreated, place)
}

func (api placeAPI) UpdatePlace(w http.ResponseWriter, r *http.Request, id PlaceId) {
	input, err := readPlaceInput(r)
	if err != nil {
		badRequest(w, invalidJSONBody)
		return
	}
	ctx := r.Context()
	tx, err := api.db.BeginTx(ctx, nil)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer tx.Rollback()

	// 担当の確認から更新の確定まで、別のリクエストが担当を変更できないようにする。
	if _, err := readAccessiblePlace(r, tx, id); err != nil {
		databaseError(w, err)
		return
	}
	user := requestSession(r).user
	if user.Role == Assignee {
		var active bool
		if err := tx.QueryRowContext(ctx, "SELECT active FROM users WHERE id = ?", user.Id).Scan(&active); err != nil {
			databaseError(w, err)
			return
		}
		if !active {
			unauthenticated(w)
			return
		}
	}

	place, err := scanPlace(tx.QueryRowContext(ctx, `
		UPDATE places SET name = ?, category = ?, longitude = ?, latitude = ?, memo = ?
		WHERE id = ?
		RETURNING id, name, category, longitude, latitude, memo, assignee_id
	`, input.Name, input.Category, input.Longitude, input.Latitude, input.Memo, id))
	if err != nil {
		databaseError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, place)
}

func (api placeAPI) DeletePlace(w http.ResponseWriter, r *http.Request, id PlaceId) {
	if !requireAdmin(w, r) {
		return
	}
	result, err := api.db.ExecContext(r.Context(), "DELETE FROM places WHERE id = ?", id)
	if err != nil {
		databaseError(w, err)
		return
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		databaseError(w, err)
		return
	}
	if deleted == 0 {
		databaseError(w, sql.ErrNoRows)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func readPlaceInput(r *http.Request) (PlaceInput, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return PlaceInput{}, err
	}
	// Use the same case-sensitive property names as OpenAPI validation.
	var values map[string]json.RawMessage
	if err := json.Unmarshal(body, &values); err != nil {
		return PlaceInput{}, err
	}
	var input PlaceInput
	for name, destination := range map[string]any{
		"name":      &input.Name,
		"category":  &input.Category,
		"longitude": &input.Longitude,
		"latitude":  &input.Latitude,
		"memo":      &input.Memo,
	} {
		if err := json.Unmarshal(values[name], destination); err != nil {
			return PlaceInput{}, err
		}
	}
	return input, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write JSON: %v", err)
	}
}

func badRequest(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusBadRequest, Error{Code: INVALIDINPUT, Message: message})
}

func databaseError(w http.ResponseWriter, err error) {
	if errors.Is(err, errForbidden) {
		forbidden(w)
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, Error{Code: PLACENOTFOUND, Message: "指定した場所が見つかりません。"})
		return
	}
	log.Printf("database: %v", err)
	http.Error(w, "Database error", http.StatusInternalServerError)
}
