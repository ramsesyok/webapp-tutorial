package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

func (api placeAPI) SetPlaceAssignee(w http.ResponseWriter, r *http.Request, id PlaceId) {
	if !requireAdmin(w, r) {
		return
	}
	var input AssignmentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
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

	place, err := readAccessiblePlace(r, tx, id)
	if err != nil {
		databaseError(w, err)
		return
	}
	if input.AssigneeId != nil {
		var assigneeID UserId
		err := tx.QueryRowContext(ctx, "SELECT id FROM users WHERE id = ? AND role = ? AND active = 1",
			*input.AssigneeId, Assignee).Scan(&assigneeID)
		if errors.Is(err, sql.ErrNoRows) {
			fields := map[string]string{"assigneeId": "有効な担当者を選んでください。"}
			writeJSON(w, http.StatusBadRequest, Error{
				Code: INVALIDINPUT, Message: fields["assigneeId"], FieldErrors: &fields,
			})
			return
		}
		if err != nil {
			databaseError(w, err)
			return
		}
	}

	previous := place.AssigneeId
	next := input.AssigneeId
	if previous == nil && next == nil || previous != nil && next != nil && *previous == *next {
		if err := tx.Commit(); err != nil {
			databaseError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, place)
		return
	}
	// 担当変更と履歴を同時に確定し、片方だけが保存されることを防ぐ。
	if _, err := tx.ExecContext(ctx, "UPDATE places SET assignee_id = ? WHERE id = ?", next, id); err != nil {
		databaseError(w, err)
		return
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO assignment_history (place_id, previous_assignee_id, new_assignee_id, actor_id, changed_at)
		VALUES (?, ?, ?, ?, ?)
	`, id, previous, next, requestSession(r).user.Id, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		databaseError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		databaseError(w, err)
		return
	}
	place.AssigneeId = next
	writeJSON(w, http.StatusOK, place)
}

func (api placeAPI) ListAssignmentHistory(w http.ResponseWriter, r *http.Request, id PlaceId) {
	ctx := r.Context()
	tx, err := api.db.BeginTx(ctx, nil)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer tx.Rollback()

	if _, err := readAccessiblePlace(r, tx, id); err != nil {
		databaseError(w, err)
		return
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT history.id, previous.login_id, next.login_id, actor.login_id, history.changed_at
		FROM assignment_history AS history
		LEFT JOIN users AS previous ON previous.id = history.previous_assignee_id
		LEFT JOIN users AS next ON next.id = history.new_assignee_id
		JOIN users AS actor ON actor.id = history.actor_id
		WHERE history.place_id = ?
		ORDER BY history.id DESC
	`, id)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer rows.Close()

	history := []AssignmentChange{}
	for rows.Next() {
		var change AssignmentChange
		var changedAt string
		if err := rows.Scan(&change.Id, &change.PreviousAssigneeLoginId, &change.NewAssigneeLoginId, &change.ActorLoginId, &changedAt); err != nil {
			databaseError(w, err)
			return
		}
		change.ChangedAt, err = time.Parse(time.RFC3339Nano, changedAt)
		if err != nil {
			databaseError(w, err)
			return
		}
		history = append(history, change)
	}
	if err := rows.Err(); err != nil {
		databaseError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, history)
}
