package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
)

type userAPI struct {
	db *sql.DB
}

var errForbidden = errors.New("operation forbidden")

func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if requestSession(r).user.Role == Admin {
		return true
	}
	forbidden(w)
	return false
}

func forbidden(w http.ResponseWriter) {
	writeJSON(w, http.StatusForbidden, Error{Code: FORBIDDEN, Message: "この操作に必要な権限がありません。"})
}

func (api userAPI) ListUsers(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	rows, err := api.db.QueryContext(r.Context(), "SELECT id, login_id, role, active FROM users ORDER BY id")
	if err != nil {
		databaseError(w, err)
		return
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.Id, &user.LoginId, &user.Role, &user.Active); err != nil {
			databaseError(w, err)
			return
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (api userAPI) CreateUser(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	var input CreateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Password == nil {
		badRequest(w, invalidJSONBody)
		return
	}
	salt, hash, err := newPasswordHash(*input.Password)
	if err != nil {
		databaseError(w, err)
		return
	}
	var user User
	err = api.db.QueryRowContext(r.Context(), `
		INSERT INTO users (login_id, password_salt, password_hash) VALUES (?, ?, ?)
		ON CONFLICT (login_id) DO NOTHING
		RETURNING id, login_id, role, active
	`, input.LoginId, salt, hash).Scan(&user.Id, &user.LoginId, &user.Role, &user.Active)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusConflict, Error{Code: LOGINIDTAKEN, Message: "このログインIDはすでに使われています。"})
		return
	}
	if err != nil {
		databaseError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (api userAPI) DisableUser(w http.ResponseWriter, r *http.Request, id UserId) {
	if !requireAdmin(w, r) {
		return
	}
	ctx := r.Context()
	tx, err := api.db.BeginTx(ctx, nil)
	if err != nil {
		databaseError(w, err)
		return
	}
	defer tx.Rollback()

	var role UserRole
	err = tx.QueryRowContext(ctx, "SELECT role FROM users WHERE id = ?", id).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, Error{Code: USERNOTFOUND, Message: "指定したユーザーが見つかりません。"})
		return
	}
	if err != nil {
		databaseError(w, err)
		return
	}
	if role != Assignee {
		forbidden(w)
		return
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET active = 0 WHERE id = ?", id); err != nil {
		databaseError(w, err)
		return
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ?", id); err != nil {
		databaseError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
