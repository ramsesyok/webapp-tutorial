package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
)

type placeAPI struct {
	db *sql.DB
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

	// SQLite lower() folds ASCII, and instr() treats characters such as % literally.
	rows, err := api.db.QueryContext(r.Context(), `
		SELECT id, name, category, longitude, latitude
		FROM places
		WHERE (? = '' OR instr(lower(name), lower(?)) > 0 OR instr(lower(memo), lower(?)) > 0)
		  AND (? = '' OR category = ?)
		ORDER BY id
	`, keyword, keyword, keyword, category, category)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer rows.Close()

	places := []PlaceSummary{}
	for rows.Next() {
		var place PlaceSummary
		if err := rows.Scan(&place.Id, &place.Name, &place.Category, &place.Longitude, &place.Latitude); err != nil {
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
	place, err := scanPlace(api.db.QueryRowContext(r.Context(), `
		SELECT id, name, category, longitude, latitude, memo FROM places WHERE id = ?
	`, id))
	if err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, place)
}

func (api placeAPI) CreatePlace(w http.ResponseWriter, r *http.Request) {
	input, err := readPlaceInput(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	place, err := scanPlace(api.db.QueryRowContext(r.Context(), `
		INSERT INTO places (name, category, longitude, latitude, memo)
		VALUES (?, ?, ?, ?, ?)
		RETURNING id, name, category, longitude, latitude, memo
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
		badRequest(w, err.Error())
		return
	}
	place, err := scanPlace(api.db.QueryRowContext(r.Context(), `
		UPDATE places SET name = ?, category = ?, longitude = ?, latitude = ?, memo = ?
		WHERE id = ?
		RETURNING id, name, category, longitude, latitude, memo
	`, input.Name, input.Category, input.Longitude, input.Latitude, input.Memo, id))
	if err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, place)
}

func (api placeAPI) DeletePlace(w http.ResponseWriter, r *http.Request, id PlaceId) {
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
	var input PlaceInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		return PlaceInput{}, err
	}
	// Go's regexp \s does not cover Unicode spaces such as U+3000.
	if strings.TrimSpace(input.Name) == "" {
		return PlaceInput{}, errors.New("場所の名前を入力してください。")
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
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, Error{Code: PLACENOTFOUND, Message: "指定した場所が見つかりません。"})
		return
	}
	log.Printf("database: %v", err)
	http.Error(w, "Database error", http.StatusInternalServerError)
}
