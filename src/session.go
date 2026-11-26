package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"time"
	"unicode/utf8"

	"github.com/getkin/kin-openapi/openapi3filter"
)

const (
	initialLoginID    = "student"
	sessionCookieName = "tutorial_session"
	sessionTokenBytes = 32
	sessionLifetime   = 8 * time.Hour
	passwordSaltBytes = 16
	passwordRounds    = 600_000
	maxPasswordChars  = 128
)

var errUnauthenticated = errors.New("invalid or expired session")

type sessionAPI struct {
	db           *sql.DB
	secureCookie bool
}

type sessionContextKey struct{}

type authenticatedSession struct {
	user      User
	tokenHash [sha256.Size]byte
}

func prepareAPIRequests(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			// Vite forwards the browser's Origin, which can differ from the Go server's address.
			origins := r.Header.Values("Origin")
			if len(origins) != 1 || !slices.Contains(allowedOrigins, origins[0]) {
				writeJSON(w, http.StatusForbidden, Error{
					Code:    INVALIDORIGIN,
					Message: "このオリジンからの更新は許可されていません。",
				})
				return
			}
		}
		ctx := context.WithValue(r.Context(), sessionContextKey{}, &authenticatedSession{})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (api sessionAPI) authenticate(ctx context.Context, input *openapi3filter.AuthenticationInput) error {
	if input.SecuritySchemeName != "sessionCookie" {
		return errors.New("unexpected OpenAPI security scheme")
	}
	tokenHash, ok := readSessionTokenHash(input.RequestValidationInput.Request)
	if !ok {
		return errUnauthenticated
	}
	session := ctx.Value(sessionContextKey{}).(*authenticatedSession)
	err := api.db.QueryRowContext(ctx, `
		SELECT users.id, users.login_id
		FROM sessions JOIN users ON users.id = sessions.user_id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?
	`, tokenHash[:], time.Now().Unix()).Scan(&session.user.Id, &session.user.LoginId)
	if errors.Is(err, sql.ErrNoRows) {
		return errUnauthenticated
	}
	session.tokenHash = tokenHash
	return err
}

func (api sessionAPI) CreateSession(w http.ResponseWriter, r *http.Request) {
	var input LoginInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Password == nil {
		badRequest(w, invalidJSONBody)
		return
	}
	ctx := r.Context()
	var user User
	salt := make([]byte, passwordSaltBytes)
	storedHash := make([]byte, sha256.Size)
	err := api.db.QueryRowContext(ctx, `
		SELECT id, login_id, password_salt, password_hash FROM users WHERE login_id = ?
	`, input.LoginId).Scan(&user.Id, &user.LoginId, &salt, &storedHash)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		databaseError(w, err)
		return
	}
	// Use the same password derivation for unknown accounts and incorrect passwords.
	hash, hashErr := hashPassword(*input.Password, salt)
	if hashErr != nil {
		databaseError(w, hashErr)
		return
	}
	if subtle.ConstantTimeCompare(hash, storedHash) != 1 || user.Id == 0 {
		writeJSON(w, http.StatusUnauthorized, Error{
			Code:    INVALIDCREDENTIALS,
			Message: "ログインIDまたはパスワードが正しくありません。",
		})
		return
	}
	token, err := api.startSession(r, user.Id)
	if err != nil {
		databaseError(w, err)
		return
	}
	http.SetCookie(w, api.sessionCookie(token, int(sessionLifetime/time.Second)))
	writeJSON(w, http.StatusOK, user)
}

func (api sessionAPI) startSession(r *http.Request, userID int64) (string, error) {
	ctx := r.Context()
	tx, err := api.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	now := time.Now()
	if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE expires_at <= ?", now.Unix()); err != nil {
		return "", err
	}
	// A successful login replaces any session presented by this browser.
	if previousHash, ok := readSessionTokenHash(r); ok {
		if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash = ?", previousHash[:]); err != nil {
			return "", err
		}
	}
	token := randomToken(sessionTokenBytes)
	tokenHash := sha256.Sum256([]byte(token))
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
	`, tokenHash[:], userID, now.Add(sessionLifetime).Unix()); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return token, nil
}

func (api sessionAPI) GetSession(w http.ResponseWriter, r *http.Request) {
	session := r.Context().Value(sessionContextKey{}).(*authenticatedSession)
	writeJSON(w, http.StatusOK, session.user)
}

func (api sessionAPI) DeleteSession(w http.ResponseWriter, r *http.Request) {
	session := r.Context().Value(sessionContextKey{}).(*authenticatedSession)
	if _, err := api.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash = ?", session.tokenHash[:]); err != nil {
		databaseError(w, err)
		return
	}
	http.SetCookie(w, api.sessionCookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

func (api sessionAPI) sessionCookie(token string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/api",
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   api.secureCookie,
	}
}

func readSessionTokenHash(r *http.Request) ([sha256.Size]byte, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || len(cookie.Value) != base64.RawURLEncoding.EncodedLen(sessionTokenBytes) {
		return [sha256.Size]byte{}, false
	}
	return sha256.Sum256([]byte(cookie.Value)), true
}

func insertInitialUser(ctx context.Context, tx *sql.Tx, password string) error {
	if !utf8.ValidString(password) || utf8.RuneCountInString(password) > maxPasswordChars {
		return errors.New("TUTORIAL_INITIAL_PASSWORD must be valid UTF-8 and at most 128 characters")
	}
	salt := make([]byte, passwordSaltBytes)
	rand.Read(salt)
	hash, err := hashPassword(password, salt)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO users (login_id, password_salt, password_hash) VALUES (?, ?, ?)
	`, initialLoginID, salt, hash)
	return err
}

func hashPassword(password string, salt []byte) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, salt, passwordRounds, sha256.Size)
}

func randomToken(size int) string {
	token := make([]byte, size)
	rand.Read(token)
	return base64.RawURLEncoding.EncodeToString(token)
}
