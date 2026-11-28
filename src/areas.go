package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type areaAPI struct {
	db *sql.DB
}

type storedArea struct {
	area    Area
	version int64
}

func (stored storedArea) etag() string {
	return fmt.Sprintf(`"area-%d-v%d"`, stored.area.Id, stored.version)
}

func scanArea(row rowScanner) (storedArea, error) {
	var stored storedArea
	var geometry []byte
	area := &stored.area
	if err := row.Scan(&area.Id, &area.Name, &area.AssigneeId, &geometry, &stored.version); err != nil {
		return stored, err
	}
	err := json.Unmarshal(geometry, &area.Geometry)
	return stored, err
}

func readAccessibleArea(r *http.Request, db rowQuerier, id AreaId) (storedArea, error) {
	stored, err := scanArea(db.QueryRowContext(r.Context(), `
		SELECT id, name, assignee_id, geometry, version FROM areas WHERE id = ?
	`, id))
	if err != nil {
		return storedArea{}, err
	}
	user := requestSession(r).user
	if user.Role != Admin && stored.area.AssigneeId != user.Id {
		return storedArea{}, errForbidden
	}
	return stored, nil
}

func (api areaAPI) ListAreas(w http.ResponseWriter, r *http.Request) {
	user := requestSession(r).user
	rows, err := api.db.QueryContext(r.Context(), `
		SELECT id, name, assignee_id, geometry, version FROM areas
		WHERE (? OR assignee_id = ?)
		ORDER BY id
	`, user.Role == Admin, user.Id)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer rows.Close()
	areas := []Area{}
	for rows.Next() {
		stored, err := scanArea(rows)
		if err != nil {
			databaseError(w, err)
			return
		}
		areas = append(areas, stored.area)
	}
	if err := rows.Err(); err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, areas)
}

func (api areaAPI) GetArea(w http.ResponseWriter, r *http.Request, id AreaId) {
	stored, err := readAccessibleArea(r, api.db, id)
	if err != nil {
		areaReadError(w, err)
		return
	}
	writeArea(w, http.StatusOK, stored)
}

func (api areaAPI) CreateArea(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	input, geometry, ok := readAreaInput(w, r)
	if !ok {
		return
	}
	// The assignee must still be active when the area is inserted.
	stored, err := scanArea(api.db.QueryRowContext(r.Context(), `
		INSERT INTO areas (name, assignee_id, geometry)
		SELECT ?, id, ? FROM users WHERE id = ? AND role = ? AND active = 1
		RETURNING id, name, assignee_id, geometry, version
	`, input.Name, geometry, input.AssigneeId, Assignee))
	if errors.Is(err, sql.ErrNoRows) {
		invalidAreaField(w, "assigneeId", "有効な担当者を選んでください。")
		return
	}
	if err != nil {
		databaseError(w, err)
		return
	}
	w.Header().Set("Location", fmt.Sprintf("/api/areas/%d", stored.area.Id))
	writeArea(w, http.StatusCreated, stored)
}

func (api areaAPI) UpdateArea(w http.ResponseWriter, r *http.Request, id AreaId, params UpdateAreaParams) {
	input, geometry, ok := readAreaInput(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	tx, err := api.db.BeginTx(ctx, nil)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer tx.Rollback()
	current, err := readAccessibleArea(r, tx, id)
	if err != nil {
		areaReadError(w, err)
		return
	}
	session := requestSession(r)
	if session.user.Role != Admin {
		var activeSession bool
		err := tx.QueryRowContext(ctx, `
			SELECT EXISTS(SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?)
		`, session.tokenHash[:], time.Now().Unix()).Scan(&activeSession)
		if err != nil {
			databaseError(w, err)
			return
		}
		if !activeSession {
			unauthenticated(w)
			return
		}
		if input.AssigneeId != current.area.AssigneeId {
			forbidden(w)
			return
		}
	}
	if params.IfMatch != current.etag() {
		areaConflict(w)
		return
	}
	if input.AssigneeId != current.area.AssigneeId {
		var activeAssignee bool
		err := tx.QueryRowContext(ctx, `
			SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND role = ? AND active = 1)
		`, input.AssigneeId, Assignee).Scan(&activeAssignee)
		if err != nil {
			databaseError(w, err)
			return
		}
		if !activeAssignee {
			invalidAreaField(w, "assigneeId", "有効な担当者を選んでください。")
			return
		}
	}
	// 版を条件にして形状と版を同時に更新し、先に保存された変更を保護する。
	stored, err := scanArea(tx.QueryRowContext(ctx, `
		UPDATE areas SET name = ?, assignee_id = ?, geometry = ?, version = version + 1
		WHERE id = ? AND version = ?
		RETURNING id, name, assignee_id, geometry, version
	`, input.Name, input.AssigneeId, geometry, id, current.version))
	if errors.Is(err, sql.ErrNoRows) {
		areaConflict(w)
		return
	}
	if err != nil {
		databaseError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		databaseError(w, err)
		return
	}
	writeArea(w, http.StatusOK, stored)
}

func readAreaInput(w http.ResponseWriter, r *http.Request) (AreaInput, string, bool) {
	var input AreaInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		badRequest(w, invalidJSONBody)
		return AreaInput{}, "", false
	}
	if message := polygonError(input.Geometry); message != "" {
		invalidAreaField(w, "geometry", message)
		return AreaInput{}, "", false
	}
	geometry, err := json.Marshal(input.Geometry)
	if err != nil {
		databaseError(w, err)
		return AreaInput{}, "", false
	}
	return input, string(geometry), true
}

func writeArea(w http.ResponseWriter, status int, stored storedArea) {
	w.Header().Set("ETag", stored.etag())
	writeJSON(w, status, stored.area)
}

func areaReadError(w http.ResponseWriter, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, Error{Code: AREANOTFOUND, Message: "指定した担当エリアが見つかりません。"})
		return
	}
	databaseError(w, err)
}

func areaConflict(w http.ResponseWriter) {
	writeJSON(w, http.StatusPreconditionFailed, Error{
		Code: AreaVersionMismatch, Message: "別の画面でこのエリアが更新されました。",
	})
}

func invalidAreaField(w http.ResponseWriter, field, message string) {
	fields := map[string]string{field: message}
	writeJSON(w, http.StatusBadRequest, Error{
		Code: INVALIDINPUT, Message: "入力内容を確認してください。", FieldErrors: &fields,
	})
}
