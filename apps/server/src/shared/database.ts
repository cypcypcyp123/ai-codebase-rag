import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const databasePath = path.resolve(process.cwd(), '../../data/app.db')

fs.mkdirSync(path.dirname(databasePath), { recursive: true })

export const db = new Database(databasePath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    framework TEXT NOT NULL,
    status TEXT NOT NULL,
    file_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)
