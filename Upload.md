# Data Upload Guide — Exam Seating System

This document explains how to upload data into the Exam Seating System, the required XLSX file structures, and how data relationships are mapped between tables.

---

## Table of Contents

1. [Overview](#overview)
2. [Data Import Flow](#data-import-flow)
3. [XLSX File Structures](#xlsx-file-structures)
   - [1. Student Master Data](#1-student-master-data)
   - [2. Elective Choices](#2-elective-choices)
   - [3. Exam Timetable](#3-exam-timetable)
   - [4. Year-Branch-Subject Mapping](#4-year-branch-subject-mapping)
   - [5. Rooms](#5-rooms)
4. [Relationship Mapping](#relationship-mapping)
5. [Column Mapping UI](#column-mapping-ui)
6. [Common Issues & Solutions](#common-issues--solutions)
7. [API Reference](#api-reference)

---

## Overview

The system requires several XLSX imports to function properly:

| Import Type | Purpose | Required Before |
|-------------|---------|-----------------|
| **Student Master** | Student roll numbers, names, branches | Creating sessions |
| **Elective Choices** | Which PE/OE each student chose | Sessions with electives |
| **Exam Timetable** | Date/slot → branch → subject schedule | Creating sessions |
| **Year-Branch-Subject** | Curriculum mapping (branch → subjects) | Sessions (auto-created via timetable) |
| **Rooms** | Room configurations with bench layouts | Allocation |

---

## Data Import Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Student Master │────▶│  student_master │────▶│                 │
│     XLSX        │     │     table       │     │                 │
└─────────────────┘     └─────────────────┘     │                 │
                                                 │                 │
┌─────────────────┐     ┌─────────────────┐     │    Session      │
│ Elective Choices│────▶│student_electives│────▶│    Creation     │
│     XLSX        │     │     table       │     │                 │
└─────────────────┘     └─────────────────┘     │                 │
                                                 │                 │
┌─────────────────┐     ┌─────────────────┐     │                 │
│  Exam Timetable │────▶│  exam_timetable │────▶│                 │
│     XLSX        │     │ + subjects      │     │                 │
│                 │     │ + branches      │     └────────┬────────┘
└─────────────────┘     └─────────────────┘              │
                                                          │
┌─────────────────┐     ┌─────────────────┐              ▼
│     Rooms       │────▶│     rooms       │────▶   Allocation
│     XLSX        │     │     table       │
└─────────────────┘     └─────────────────┘
```

---

## XLSX File Structures

### 1. Student Master Data

**Purpose:** Import all students with their roll numbers, names, branches, and sections.

**Required Columns:**
| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| Roll Number | ✅ Yes | Unique student ID | `2451-22-733-001`, `2451-23-733-045` |
| Student Name | ⚠️ Recommended | Full name | `John Doe`, `Priya Sharma` |
| Branch | ⚠️ Recommended | Branch code | `CSE`, `CSIT`, `ECE`, `CSE-AIML` |
| Section | Optional | Section identifier | `A`, `B`, `C`, `` (empty) |

**Sample XLSX Structure:**
```
┌─────────────────────┬──────────────────┬────────┬─────────┐
│ Roll Number (HTNO)  │ Name of Student  │ Branch │ Section │
├─────────────────────┼──────────────────┼────────┼─────────┤
│ 2451-22-733-001     │ John Doe         │ CSE    │ A       │
│ 2451-22-733-002     │ Jane Smith       │ CSE    │ A       │
│ 2451-22-733-003     │ Bob Wilson       │ CSE    │ B       │
│ 2451-23-733-001     │ Alice Brown      │ CSIT   │         │
└─────────────────────┴──────────────────┴────────┴─────────┘
```

**Year Mapping:** The system extracts the academic year from the roll number format:
- Roll format: `XXXX-YY-ZZZ-NNN` where `YY` is the admission year code
- Example mapping:
  - `22` → Year 4 (2022 batch, now in 4th year)
  - `23` → Year 3 (2023 batch, now in 3rd year)
  - `24` → Year 2 (2024 batch, now in 2nd year)

**API Endpoint:** `POST /api/config/students/import`

**Request Body:**
```json
{
  "fileData": "<base64-encoded-xlsx>",
  "yearMapping": { "22": 4, "23": 3, "24": 2, "25": 1 },
  "columnMapping": {
    "rollNumber": 1,
    "studentName": 2,
    "branch": 3,
    "section": 4
  },
  "sheetName": "Sheet1",
  "headerRow": 1,
  "createMissingBranches": true
}
```

---

### 2. Elective Choices

**Purpose:** Map which Professional Elective (PE) or Open Elective (OE) each student has chosen.

**Required Columns:**
| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| Roll Number | ✅ Yes | Must match student_master | `2451-22-733-001` |
| PE Subject(s) | ⚠️ At least one | PE subject code/name | `Graph Theory`, `SPM`, `ML` |
| OE Subject(s) | ⚠️ At least one | OE subject code/name | `Entrepreneurship` |

**Sample XLSX Structure:**
```
┌─────────────────────┬─────────────────────┬─────────────────────┬─────────────────┐
│ Roll Number         │ PE-I                │ PE-II               │ OE-I            │
├─────────────────────┼─────────────────────┼─────────────────────┼─────────────────┤
│ 2451-22-733-001     │ Graph Theory        │ ML                  │ Entrepreneurship│
│ 2451-22-733-002     │ Cryptography        │ SPM                 │ IPR             │
│ 2451-22-733-003     │ Graph Theory        │ Data Mining         │ Entrepreneurship│
└─────────────────────┴─────────────────────┴─────────────────────┴─────────────────┘
```

**Multiple Elective Columns:** You can map multiple PE and OE columns:
- `peSubjectCodes: [2, 3]` — PE columns at positions 2 and 3
- `oeSubjectCodes: [4]` — OE column at position 4

**API Endpoint:** `POST /api/config/electives/import`

**Request Body:**
```json
{
  "fileData": "<base64-encoded-xlsx>",
  "year": 3,
  "columnMapping": {
    "rollNumber": 1,
    "peSubjectCodes": [2, 3],
    "oeSubjectCodes": [4]
  },
  "sheetName": "Sheet1",
  "headerRow": 1,
  "createMissing": true
}
```

---

### 3. Exam Timetable

**Purpose:** Define which branch has which subject on which date/slot.

**Required Columns:**
| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| Branch | ✅ Yes | Branch code | `CSE`, `ECE`, `AIML` |
| Subject | ✅ Yes | Subject code or name | `CS301`, `Data Structures` |
| Exam Date | ✅ Yes | Date of exam | `2026-03-15`, `15-03-2026` |
| Year | ⚠️ Required if not in body | Academic year (1-4) | `1`, `2`, `3`, `4` |
| Slot | Optional | Time slot | `FN`, `AN` |
| Time | Optional | Actual timing | `10:00-11:10`, `2:30-3:40` |
| Semester | Optional | Semester number | `6`, `IV` |
| Academic Year | Optional | Year range | `2025-26(EVEN)` |

**Sample XLSX Structure:**
```
┌────────┬─────────────────────────────────────────┬────────────┬──────┬──────┬─────────┐
│ Branch │ Subject Name                            │ Exam Date  │ Year │ Slot │ Time    │
├────────┼─────────────────────────────────────────┼────────────┼──────┼──────┼─────────┤
│ CSE    │ Data Structures                         │ 2026-03-15 │ 2    │ FN   │ 10:00   │
│ CSE    │ Professional Elective – II(Graph Theory)│ 2026-03-16 │ 3    │ FN   │ 10:00   │
│ ECE    │ Digital Electronics                     │ 2026-03-15 │ 2    │ AN   │ 2:30    │
│ CSIT   │ Open Elective - II : Entrepreneurship   │ 2026-03-17 │ 3    │ FN   │ 10:00   │
└────────┴─────────────────────────────────────────┴────────────┴──────┴──────┴─────────┘
```

**Transposed Format (Date as Columns):**

The system also supports transposed timetables where dates are column headers:

```
┌────────┬────────────────────────┬────────────────────────┬────────────────────────┐
│ Branch │ 15-03-2026             │ 16-03-2026             │ 17-03-2026             │
├────────┼────────────────────────┼────────────────────────┼────────────────────────┤
│ CSE    │ Data Structures        │ PE-II(Graph Theory)    │ OE-II:Entrepreneurship │
│ ECE    │ Digital Electronics    │ Analog Circuits        │ Control Systems        │
│ CSIT   │ Data Structures        │ PE-II(ML)              │ OE-II:IPR              │
└────────┴────────────────────────┴────────────────────────┴────────────────────────┘
```

**API Endpoint:** `POST /api/config/timetable/import`

**Request Body:**
```json
{
  "fileData": "<base64-encoded-xlsx>",
  "year": 2,
  "columnMapping": {
    "branch": 1,
    "subjectCode": 2,
    "examDate": 3,
    "slot": 4,
    "time": 5,
    "semester": 6,
    "academicYear": 7,
    "year": 8
  },
  "sheetName": "Sheet1",
  "headerRow": 1,
  "createMissing": true
}
```

---

### 4. Year-Branch-Subject Mapping

**Purpose:** Define curriculum — which subjects each branch has for each year.

> **Note:** This is typically auto-created when importing timetable data. Use this import only for standalone curriculum mapping.

**Required Columns:**
| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| Branch | ✅ Yes | Branch code | `CSE`, `ECE` |
| Subject Code | ⚠️ One required | Subject code | `CS301` |
| Subject Name | ⚠️ One required | Subject name | `Data Structures` |
| Year | Optional | Academic year (1-4) | `2` |
| Subject Type | Optional | Type of subject | `REGULAR`, `PE`, `OE` |

**Sample XLSX Structure:**
```
┌────────┬─────────────┬─────────────────────┬──────┬──────────────┐
│ Branch │ Subject Code│ Subject Name        │ Year │ Subject Type │
├────────┼─────────────┼─────────────────────┼──────┼──────────────┤
│ CSE    │ CS301       │ Data Structures     │ 2    │ REGULAR      │
│ CSE    │ CS302       │ Graph Theory        │ 3    │ PE           │
│ ECE    │ EC201       │ Digital Electronics │ 2    │ REGULAR      │
│ ALL    │ OE101       │ Entrepreneurship    │ 3    │ OE           │
└────────┴─────────────┴─────────────────────┴──────┴──────────────┘
```

**Auto-Detection of Subject Type:**
- Names containing `Professional Elective` or `PE` → `PE`
- Names containing `Open Elective` or `OE` → `OE`
- Otherwise → `REGULAR`

**API Endpoint:** `POST /api/config/year-subjects/import`

---

### 5. Rooms

**Purpose:** Import room configurations with bench layouts.

**Required Columns:**
| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| Room Code | ✅ Yes | Unique room identifier | `AS201`, `LH-1`, `Room A` |
| Rows | ✅ Yes | Number of rows | `10`, `8`, `6` |
| Columns | ✅ Yes | Number of columns (benches) | `6`, `8`, `5` |
| Effective Capacity | Optional | Override capacity | `40`, `50` |

**Sample XLSX Structure:**
```
┌───────────┬──────┬─────────┬────────────────────┐
│ Room Code │ Rows │ Columns │ Effective Capacity │
├───────────┼──────┼─────────┼────────────────────┤
│ AS201     │ 10   │ 6       │ 60                 │
│ AS202     │ 8    │ 6       │ 48                 │
│ LH-1      │ 15   │ 8       │ 100                │
│ Lab-A     │ 5    │ 10      │ 40                 │
└───────────┴──────┴─────────┴────────────────────┘
```

**Capacity Calculation:**
- Each bench has 2 seats (A = left, B = right)
- Total capacity = `rows × columns × 2`
- Effective capacity can override this (for rooms with broken benches, etc.)

**API Endpoint:** `POST /api/config/rooms/import`

---

## Relationship Mapping

### Database Entity Relationships

```
┌──────────────────┐
│  student_master  │
│  (roll, branch,  │
│   name, year)    │
└────────┬─────────┘
         │ roll_number
         ▼
┌──────────────────┐      ┌──────────────┐
│student_electives │─────▶│   subjects   │
│(roll → subject)  │      │(id, code,    │
└──────────────────┘      │ name)        │
                          └──────┬───────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│year_branch_     │    │  exam_timetable │    │   branches      │
│subjects         │    │  (date, slot,   │    │  (code, name,   │
│(year→branch→    │    │   branch→subj)  │    │   section)      │
│ subject)        │    └─────────────────┘    └─────────────────┘
└─────────────────┘              │
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │     exam_sessions       │
                    │  (date, slot, year,     │
                    │   seating_mode)         │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ session_rooms   │ │session_branch_  │ │    students     │
    │ (session→room)  │ │subjects         │ │(session, roll,  │
    └────────┬────────┘ │(session→branch  │ │ branch, subject)│
             │          │ →subject)       │ └────────┬────────┘
             │          └─────────────────┘          │
             │                                       │
             └───────────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   seat_allocations      │
                    │  (session, room, row,   │
                    │   col, seat, student)   │
                    └─────────────────────────┘
```

### Key Relationships

| Source Table | Foreign Key | Target Table | Relationship |
|--------------|-------------|--------------|--------------|
| `student_electives` | `roll_number` | `student_master` | Many-to-One |
| `student_electives` | `subject_id` | `subjects` | Many-to-One |
| `year_branch_subjects` | `branch_id` | `branches` | Many-to-One |
| `year_branch_subjects` | `subject_id` | `subjects` | Many-to-One |
| `exam_timetable` | `branch_id` | `branches` | Many-to-One |
| `exam_timetable` | `subject_id` | `subjects` | Many-to-One |
| `session_rooms` | `session_id` | `exam_sessions` | Many-to-One |
| `session_rooms` | `room_id` | `rooms` | Many-to-One |
| `session_branch_subjects` | `session_id` | `exam_sessions` | Many-to-One |
| `session_branch_subjects` | `branch_id` | `branches` | Many-to-One |
| `session_branch_subjects` | `subject_id` | `subjects` | Many-to-One |
| `students` | `session_id` | `exam_sessions` | Many-to-One |
| `seat_allocations` | `session_id` | `exam_sessions` | Many-to-One |
| `seat_allocations` | `room_id` | `rooms` | Many-to-One |
| `seat_allocations` | `student_id` | `students` | Many-to-One |

---

## Column Mapping UI

When you upload an XLSX file, the system:

1. **Detects headers** — Scans first 20 rows to find header row using known keywords
2. **Shows preview** — Displays headers and 5 sample data rows
3. **Auto-suggests columns** — Maps common header names automatically
4. **Allows manual override** — User can select correct columns

**Known Header Keywords (Auto-detected):**
- Roll Number: `roll`, `htno`, `hall ticket`
- Student Name: `name of the student`, `student name`, `name`
- Branch: `branch`
- Section: `section`, `sec`
- Subject Code: `subject code`, `sub code`, `subcode`
- Subject Name: `subject name`, `sub name`
- Exam Date: `date`, `exam date`
- Slot: `slot`, `session`, `fn/an`
- Year: `year`, `yr`
- Semester: `sem`, `semester`

---

## Common Issues & Solutions

### Issue 1: "No students found for elective"

**Causes:**
1. No student_master data imported for that branch
2. No elective choices imported for that branch/year
3. Subject names don't match between timetable and electives

**Solution:**
```bash
# Check via diagnostic API
GET /api/config/diagnostics/elective-mismatch?year=3
```

### Issue 2: Elective Name Mismatch

**The Problem:**
Timetable has full names:
- `Professional Elective – II(Graph Theory)`

Elective import has short names:
- `Graph Theory`

**Solution:** The system extracts short names from prefixes using these patterns:
```
"PE – II : Object Oriented System Development" → "Object Oriented System Development"
"Professional Elective – II(Graph Theory)" → "Graph Theory"
"Open Elective - II : Entrepreneurship" → "Entrepreneurship"
```

### Issue 3: Wrong Year Value

**The Problem:**
- "Academic Year" column (e.g., `2025-26(EVEN)`) mapped to numeric "Year" field
- Server rejects non-numeric year values

**Solution:**
- Map numeric `Year` column (1-4) separately
- Map text `Academic Year` column for display purposes

### Issue 4: Branches with Sections

**The Problem:**
Students in `CSE-A` not showing separately from `CSE-B`

**Solution:**
- Import students with `Section` column mapped
- System creates separate branch entries: `CSE` + `A`, `CSE` + `B`
- Unique constraint: `(branch_code, section)`

---

## API Reference

### Import APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/xlsx/detect-columns` | POST | Detect headers in XLSX file |
| `/api/config/students/import` | POST | Import student master data |
| `/api/config/electives/import` | POST | Import elective choices |
| `/api/config/timetable/import` | POST | Import exam timetable |
| `/api/config/year-subjects/import` | POST | Import year-branch-subject mapping |
| `/api/config/rooms/import` | POST | Import room configurations |

### Query APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/students` | GET | Get students (filterable) |
| `/api/config/students/years` | GET | Get available years |
| `/api/config/students/branches` | GET | Get branches for a year |
| `/api/config/timetable` | GET | Get timetable entries |
| `/api/config/timetable/dates` | GET | Get unique exam dates |
| `/api/config/electives` | GET | Get elective choices |
| `/api/config/diagnostics/elective-mismatch` | GET | Check for mismatches |

### Delete/Reset APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/reset` | DELETE | Reset entire database |
| `/api/config/timetable/:year` | DELETE | Delete timetable for year |
| `/api/config/year-subjects/:year` | DELETE | Delete mappings for year |

---

## Best Practices

1. **Import Order:**
   - Rooms first (needed for allocation)
   - Student Master (needed for session creation)
   - Timetable (creates subjects, branches, mappings)
   - Elective Choices (must match subjects from timetable)

2. **Consistency:**
   - Use same branch codes across all files
   - Use same roll number format everywhere
   - Keep subject names consistent (or use subject codes)

3. **Verification:**
   - Check `/api/config/diagnostics/elective-mismatch` after imports
   - Verify student counts in session creation UI
   - Review any import errors in response

4. **Backup:**
   - Export data before re-importing
   - Use "Replace" mode carefully (deletes existing data)
