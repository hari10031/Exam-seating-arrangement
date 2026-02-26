-- ============================================================
-- EXAM SEATING ARRANGEMENT SYSTEM — DATABASE SCHEMA
-- ============================================================
-- Relational design using SQLite (portable, zero-config).
-- Easily adaptable to PostgreSQL / Neon by changing types.
-- ============================================================

-- -------------------------------------------------------
-- 1. ROOMS
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code   TEXT    NOT NULL UNIQUE,          -- e.g. "AS201"
    total_capacity INTEGER NOT NULL,              -- derived: rows * columns * seats_per_bench
    rows        INTEGER NOT NULL CHECK (rows > 0),
    columns     INTEGER NOT NULL CHECK (columns > 0),  -- each column = 1 bench
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------
-- 2. BRANCHES  (CSE, CSIT, CSE AI/ML, etc.)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_code TEXT    NOT NULL UNIQUE,           -- e.g. "CSE"
    branch_name TEXT    NOT NULL,                  -- e.g. "Computer Science & Engineering"
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------
-- 3. SUBJECTS
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_code TEXT    NOT NULL UNIQUE,           -- e.g. "CS301"
    subject_name TEXT    NOT NULL,                  -- e.g. "Data Structures"
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------
-- 4. EXAM SESSIONS  (a single sitting / time-slot)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name  TEXT    NOT NULL,                 -- e.g. "Mid-Sem Dec 2025 – Slot A"
    exam_date     TEXT    NOT NULL,                 -- ISO date
    start_time    TEXT,                             -- HH:MM
    end_time      TEXT,
    seating_mode       TEXT NOT NULL DEFAULT 'SINGLE'       CHECK (seating_mode IN ('SINGLE','DOUBLE')),
    allocation_method  TEXT NOT NULL DEFAULT 'INTERLEAVED'  CHECK (allocation_method IN ('INTERLEAVED','LINEAR')),
    status             TEXT NOT NULL DEFAULT 'DRAFT'        CHECK (status IN ('DRAFT','ALLOCATED','LOCKED')),
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------
-- 5. SESSION ↔ ROOM mapping  (which rooms are used)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    UNIQUE(session_id, room_id)
);

-- -------------------------------------------------------
-- 6. SESSION ↔ BRANCH ↔ SUBJECT mapping
--    Each branch has exactly ONE subject per session.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_branch_subjects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE(session_id, branch_id)
);

-- -------------------------------------------------------
-- 7. STUDENTS  (roll-number entries for a session)
--    Generated from admin-provided ranges + exclusions.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    branch_id     INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    roll_number   TEXT    NOT NULL,
    student_name  TEXT,                              -- Student's full name (from XLSX import)
    UNIQUE(session_id, roll_number)
);

-- -------------------------------------------------------
-- 8. SEAT ALLOCATIONS  (the output)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS seat_allocations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    row_number      INTEGER NOT NULL,   -- 1-based
    column_number   INTEGER NOT NULL,   -- 1-based (bench number)
    seat_position   TEXT    NOT NULL CHECK (seat_position IN ('A','B')),  -- A=left, B=right
    student_id      INTEGER REFERENCES students(id) ON DELETE SET NULL,
    roll_number     TEXT,
    branch_code     TEXT,
    subject_name    TEXT,
    UNIQUE(session_id, room_id, row_number, column_number, seat_position)
);

-- -------------------------------------------------------
-- 9. ALLOCATION REPORTS  (validation summaries)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS allocation_reports (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    total_students      INTEGER NOT NULL DEFAULT 0,
    total_seats          INTEGER NOT NULL DEFAULT 0,
    assigned_count      INTEGER NOT NULL DEFAULT 0,
    unassigned_count    INTEGER NOT NULL DEFAULT 0,
    unassigned_reasons  TEXT,            -- JSON array of {rollNumber, reason}
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------
-- INDEXES for common query patterns
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_session     ON students(session_id);
CREATE INDEX IF NOT EXISTS idx_students_branch      ON students(session_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_allocations_session  ON seat_allocations(session_id);
CREATE INDEX IF NOT EXISTS idx_allocations_room     ON seat_allocations(session_id, room_id);
