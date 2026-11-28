package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func openDatabase(filename, initialPassword string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return nil, err
	}
	// One connection is sufficient for the tutorial and serializes writes.
	db.SetMaxOpenConns(1)
	if err := initializeDatabase(db, initialPassword); err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize SQLite: %w", err)
	}
	return db, nil
}

func initializeDatabase(db *sql.DB, initialPassword string) error {
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var version int
	if err := tx.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	if version == 4 {
		return nil
	}
	if version < 0 || version > 4 {
		return fmt.Errorf("unsupported database version %d", version)
	}

	if version == 0 {
		// Seed only on first creation, so deleted places do not return on restart.
		if _, err := tx.ExecContext(ctx, `
		CREATE TABLE places (
			id INTEGER PRIMARY KEY AUTOINCREMENT CHECK (id <= 2147483647),
			name TEXT NOT NULL,
			category TEXT NOT NULL,
			longitude REAL NOT NULL,
			latitude REAL NOT NULL,
			memo TEXT NOT NULL
		);
		INSERT INTO places (name, category, longitude, latitude, memo) VALUES
			('ブランデンブルク門', 'sightseeing', 13.3777, 52.5163, 'ベルリン観光の初日に訪れたい'),
			('ベルリン動物園', 'nature', 13.3377, 52.5075, 'Zoologischer Garten Berlin'),
			('台北の夜市', 'food', 121.5246, 25.0879, '屋台料理を食べたい');
		`); err != nil {
			return err
		}
	}

	generated := false
	if version < 2 {
		if _, err := tx.ExecContext(ctx, `
		CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			login_id TEXT NOT NULL UNIQUE,
			password_salt BLOB NOT NULL,
			password_hash BLOB NOT NULL
		);
		CREATE TABLE sessions (
			token_hash BLOB PRIMARY KEY NOT NULL,
			user_id INTEGER NOT NULL REFERENCES users(id),
			expires_at INTEGER NOT NULL
		);
		`); err != nil {
			return err
		}
		generated = initialPassword == ""
		if generated {
			initialPassword = randomToken(18)
		}
		if err := insertInitialUser(ctx, tx, initialPassword); err != nil {
			return err
		}
	}

	if version < 3 {
		// レベル2の初期アカウントを管理者にし、既存の拠点は未割り当てで引き継ぐ。
		// 権限が変わるため、移行前のセッションは取り消して再ログインを求める。
		if _, err := tx.ExecContext(ctx, `
		ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'assignee'
			CHECK (role IN ('admin', 'assignee'));
		ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
		UPDATE users SET role = 'admin' WHERE login_id = ?;
		DELETE FROM sessions;
		ALTER TABLE places ADD COLUMN assignee_id INTEGER REFERENCES users(id);
		CREATE INDEX places_by_assignee ON places (assignee_id);
		CREATE TABLE assignment_history (
			id INTEGER PRIMARY KEY,
			place_id INTEGER NOT NULL,
			previous_assignee_id INTEGER REFERENCES users(id),
			new_assignee_id INTEGER REFERENCES users(id),
			actor_id INTEGER NOT NULL REFERENCES users(id),
			changed_at TEXT NOT NULL
		);
		CREATE INDEX assignment_history_by_place ON assignment_history (place_id, id);
		`, initialLoginID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		CREATE TABLE areas (
			id INTEGER PRIMARY KEY CHECK (id <= 2147483647),
			name TEXT NOT NULL,
			assignee_id INTEGER NOT NULL REFERENCES users(id),
			geometry TEXT NOT NULL,
			version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
		);
		CREATE INDEX areas_by_assignee ON areas (assignee_id);
		PRAGMA user_version = 4;
	`); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if generated {
		log.Printf("Initial tutorial account (shown once): login ID %s, password %s", initialLoginID, initialPassword)
	}
	return nil
}

type rowScanner interface {
	Scan(...any) error
}

func scanPlace(row rowScanner) (Place, error) {
	var place Place
	err := row.Scan(&place.Id, &place.Name, &place.Category, &place.Longitude, &place.Latitude, &place.Memo, &place.AssigneeId)
	return place, err
}
