/**
 * DATABASE CONNECTION — SQLite via better-sqlite3
 * ================================================
 * Single-file, synchronous, zero-config database.
 * Swap to pg/neon by changing this module alone.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'seating.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initSchema(db);
    }
    return db;
}

function initSchema(database) {
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    database.exec(schema);

    // Migration: add allocation_method column if missing (for existing databases)
    try {
        const cols = database.prepare("PRAGMA table_info(exam_sessions)").all();
        if (!cols.find(c => c.name === 'allocation_method')) {
            database.exec("ALTER TABLE exam_sessions ADD COLUMN allocation_method TEXT NOT NULL DEFAULT 'INTERLEAVED'");
        }
    } catch (_) { /* column already exists */ }
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, closeDb };
