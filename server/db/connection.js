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
            database.exec("ALTER TABLE exam_sessions ADD COLUMN allocation_method TEXT NOT NULL DEFAULT 'LINEAR'");
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
            year            INTEGER,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            source_file     TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_student_master_roll ON student_master(roll_number);
        CREATE INDEX IF NOT EXISTS idx_student_master_branch ON student_master(branch_code);
    `);

    // Migration: add year column to student_master if missing (before creating year index)
    try {
        const smCols = database.prepare("PRAGMA table_info(student_master)").all();
        if (!smCols.find(c => c.name === 'year')) {
            database.exec("ALTER TABLE student_master ADD COLUMN year INTEGER");
        }
    } catch (_) { /* column already exists */ }

    // Now safe to create year index
    database.exec("CREATE INDEX IF NOT EXISTS idx_student_master_year ON student_master(year);");

    // Migration: add section column to student_master if missing
    try {
        const smCols2 = database.prepare("PRAGMA table_info(student_master)").all();
        if (!smCols2.find(c => c.name === 'section')) {
            database.exec("ALTER TABLE student_master ADD COLUMN section TEXT DEFAULT ''");
        }
    } catch (_) { /* column already exists */ }

    // Migration: add year column to exam_sessions if missing
    try {
        const esCols = database.prepare("PRAGMA table_info(exam_sessions)").all();
        if (!esCols.find(c => c.name === 'year')) {
            database.exec("ALTER TABLE exam_sessions ADD COLUMN year INTEGER");
        }
    } catch (_) { /* column already exists */ }

    // Migration: add time_slot column to exam_timetable if missing
    try {
        const ttCols = database.prepare("PRAGMA table_info(exam_timetable)").all();
        if (!ttCols.find(c => c.name === 'time_slot')) {
            database.exec("ALTER TABLE exam_timetable ADD COLUMN time_slot TEXT");
        }
    } catch (_) { /* column already exists */ }

    // Migration: change exam_timetable UNIQUE constraint to include subject_id
    // SQLite doesn't support ALTER CONSTRAINT, so we recreate the table if needed
    try {
        const idxInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='exam_timetable'").get();
        if (idxInfo && idxInfo.sql && idxInfo.sql.includes('UNIQUE(year, branch_id, exam_date, slot)') && !idxInfo.sql.includes('subject_id, exam_date')) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS exam_timetable_new (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    year        INTEGER NOT NULL,
                    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
                    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                    exam_date   TEXT    NOT NULL,
                    slot        TEXT,
                    time_slot   TEXT,
                    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(year, branch_id, subject_id, exam_date, slot)
                );
                INSERT OR IGNORE INTO exam_timetable_new (id, year, branch_id, subject_id, exam_date, slot, created_at)
                    SELECT id, year, branch_id, subject_id, exam_date, slot, created_at FROM exam_timetable;
                DROP TABLE exam_timetable;
                ALTER TABLE exam_timetable_new RENAME TO exam_timetable;
                CREATE INDEX IF NOT EXISTS idx_exam_timetable_date ON exam_timetable(exam_date, slot);
            `);
        }
    } catch (_) { /* migration already applied or table is new */ }

    // Migration: add slot column to exam_sessions if missing
    try {
        const esCols2 = database.prepare("PRAGMA table_info(exam_sessions)").all();
        if (!esCols2.find(c => c.name === 'slot')) {
            database.exec("ALTER TABLE exam_sessions ADD COLUMN slot TEXT");
        }
    } catch (_) { /* column already exists */ }

    // Migration: add student_name column to seat_allocations if missing
    try {
        const saCols = database.prepare("PRAGMA table_info(seat_allocations)").all();
        if (!saCols.find(c => c.name === 'student_name')) {
            database.exec("ALTER TABLE seat_allocations ADD COLUMN student_name TEXT");
        }
    } catch (_) { /* column already exists */ }

    // Migration: change session_branch_subjects UNIQUE constraint to (session_id, branch_id, subject_id)
    // to allow multiple subjects per branch in one session (electives).
    try {
        const sbsInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='session_branch_subjects'").get();
        if (sbsInfo && sbsInfo.sql && sbsInfo.sql.includes('UNIQUE(session_id, branch_id)') && !sbsInfo.sql.includes('branch_id, subject_id)')) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS session_branch_subjects_new (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id  INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
                    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
                    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                    UNIQUE(session_id, branch_id, subject_id)
                );
                INSERT OR IGNORE INTO session_branch_subjects_new (id, session_id, branch_id, subject_id)
                    SELECT id, session_id, branch_id, subject_id FROM session_branch_subjects;
                DROP TABLE session_branch_subjects;
                ALTER TABLE session_branch_subjects_new RENAME TO session_branch_subjects;
            `);
        }
    } catch (_) { /* migration already applied or table is new */ }

    // Migration: add section column to branches if missing
    try {
        const branchCols = database.prepare("PRAGMA table_info(branches)").all();
        if (!branchCols.find(c => c.name === 'section')) {
            database.exec("ALTER TABLE branches ADD COLUMN section TEXT NOT NULL DEFAULT ''");
            // Change UNIQUE constraint from (branch_code) to (branch_code, section)
            try {
                const bInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='branches'").get();
                if (bInfo && bInfo.sql && bInfo.sql.includes('branch_code') && !bInfo.sql.includes('branch_code, section')) {
                    database.exec(`
                        CREATE TABLE IF NOT EXISTS branches_new (
                            id          INTEGER PRIMARY KEY AUTOINCREMENT,
                            branch_code TEXT    NOT NULL,
                            branch_name TEXT    NOT NULL,
                            section     TEXT    NOT NULL DEFAULT '',
                            created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                            UNIQUE(branch_code, section)
                        );
                        INSERT OR IGNORE INTO branches_new (id, branch_code, branch_name, section, created_at)
                            SELECT id, branch_code, branch_name, '', created_at FROM branches;
                        DROP TABLE branches;
                        ALTER TABLE branches_new RENAME TO branches;
                    `);
                }
            } catch (_) { /* table already has new constraint */ }
        }
    } catch (_) { /* column already exists */ }

    // Migration: add branch_section column to seat_allocations if missing
    try {
        const saCols = database.prepare("PRAGMA table_info(seat_allocations)").all();
        if (!saCols.find(c => c.name === 'branch_section')) {
            database.exec("ALTER TABLE seat_allocations ADD COLUMN branch_section TEXT DEFAULT ''");
        }
    } catch (_) { /* column already exists */ }

    // Migration: add section column to student_master if missing
    try {
        const smCols2 = database.prepare("PRAGMA table_info(student_master)").all();
        if (!smCols2.find(c => c.name === 'section')) {
            database.exec("ALTER TABLE student_master ADD COLUMN section TEXT NOT NULL DEFAULT ''");
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
