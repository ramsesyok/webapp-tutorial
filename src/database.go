package main

import (
	"context"
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

func openDatabase(filename string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return nil, err
	}
	// One connection is sufficient for the tutorial and serializes writes.
	db.SetMaxOpenConns(1)
	if err := initializeDatabase(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize SQLite: %w", err)
	}
	return db, nil
}

func initializeDatabase(db *sql.DB) error {
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var version int
	if err := tx.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	if version == 1 {
		return nil
	}
	if version != 0 {
		return fmt.Errorf("unsupported database version %d", version)
	}

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
		PRAGMA user_version = 1;
	`); err != nil {
		return err
	}
	return tx.Commit()
}

type rowScanner interface {
	Scan(...any) error
}

func scanPlace(row rowScanner) (Place, error) {
	var place Place
	err := row.Scan(&place.Id, &place.Name, &place.Category, &place.Longitude, &place.Latitude, &place.Memo)
	return place, err
}
