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

    // Migration: add student_name column if missing (for XLSX import)
    try {
        const studentCols = database.prepare("PRAGMA table_info(students)").all();
        if (!studentCols.find(c => c.name === 'student_name')) {
            database.exec("ALTER TABLE students ADD COLUMN student_name TEXT");
        }
    } catch (_) { /* column already exists */ }

    // Create student_master table for imported XLSX data
    database.exec(`
        CREATE TABLE IF NOT EXISTS student_master (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            roll_number     TEXT NOT NULL UNIQUE,
            student_name    TEXT,
            branch_code     TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            source_file     TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_student_master_roll ON student_master(roll_number);
        CREATE INDEX IF NOT EXISTS idx_student_master_branch ON student_master(branch_code);
    `);
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, closeDb };
