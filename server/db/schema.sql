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
    branch_code TEXT    NOT NULL,                   -- e.g. "CSE"
    branch_name TEXT    NOT NULL,                  -- e.g. "Computer Science & Engineering"
    section     TEXT    NOT NULL DEFAULT '',        -- e.g. "A", "B", or '' for no section
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(branch_code, section)
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
-- 3a. YEAR → BRANCH → SUBJECT MAPPING (curriculum config)
--     Maps which subjects each branch has for each year.
--     Imported from XLSX per year.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS year_branch_subjects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    year        INTEGER NOT NULL CHECK (year >= 1 AND year <= 6),  -- e.g. 1, 2, 3, 4
    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL DEFAULT 'REGULAR'
        CHECK (subject_type IN ('REGULAR','PE','OE')),  -- Professional/Open Elective
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(year, branch_id, subject_id)
);

-- -------------------------------------------------------
-- 3b. STUDENT ELECTIVE CHOICES
--     Maps students to their chosen PE/OE subjects.
--     Imported from XLSX.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_electives (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT    NOT NULL,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    elective_type TEXT NOT NULL CHECK (elective_type IN ('PE','OE')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(roll_number, subject_id)
);

-- -------------------------------------------------------
-- 3c. EXAM TIMETABLE
--     Maps date+slot → branch → subject for each exam.
--     Imported from XLSX.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_timetable (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    year        INTEGER NOT NULL,
    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    exam_date   TEXT    NOT NULL,       -- ISO date
    slot        TEXT,                   -- e.g. "FN" (forenoon), "AN" (afternoon)
    time_slot   TEXT,                   -- e.g. "10:00-11:10", "2:30-3:40"
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(year, branch_id, subject_id, exam_date, slot)
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
    slot          TEXT,                             -- time slot e.g. "10:00-11:10"
    year          INTEGER,                          -- academic year (1-4)
    seating_mode       TEXT NOT NULL DEFAULT 'SINGLE'       CHECK (seating_mode IN ('SINGLE','DOUBLE')),
    allocation_method  TEXT NOT NULL DEFAULT 'LINEAR'       CHECK (allocation_method IN ('INTERLEAVED','LINEAR')),
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
--    A branch may map to MULTIPLE subjects in one session
--    (e.g. electives: some CSE students take PE-1, others PE-2).
--    Now auto-populated from year_branch_subjects + exam_timetable.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_branch_subjects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE(session_id, branch_id, subject_id)
);

-- -------------------------------------------------------
-- 7. STUDENTS  (roll-number entries for a session)
--    Now populated from student_master DB instead of ranges.
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
    student_name    TEXT,
    branch_code     TEXT,
    branch_section  TEXT    DEFAULT '',  -- section label (A, B, etc.)
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
CREATE INDEX IF NOT EXISTS idx_ybs_year_branch      ON year_branch_subjects(year, branch_id);
CREATE INDEX IF NOT EXISTS idx_student_electives_roll ON student_electives(roll_number);
CREATE INDEX IF NOT EXISTS idx_exam_timetable_date  ON exam_timetable(exam_date, slot);
