# Exam Seating System - Technical Architecture

## Overview

This is an exam seating allocation system that manages:
- Student data import and management
- Room configuration with bench layouts
- Exam timetable management
- Elective subject choices
- Automated seating allocation (SINGLE/DOUBLE mode)
- Excel/PDF export

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  client/src/pages/                                              │
│  ├── ConfigurationPage.js   # Data imports, room setup          │
│  ├── SessionDetail.js       # Session management, allocation    │
│  └── RoomsPage.js           # Room configuration                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                       │
│  server/routes/                                                 │
│  ├── config.js    # XLSX imports, student/subject management    │
│  ├── sessions.js  # Session CRUD, allocation, export            │
│  └── rooms.js     # Room management                             │
│                                                                 │
│  server/models/                                                 │
│  ├── Configuration.js  # Student/timetable queries              │
│  ├── ExamSession.js    # Session persistence                    │
│  └── Room.js           # Room queries                           │
│                                                                 │
│  server/engine/                                                 │
│  └── allocator.js      # Seating allocation algorithm           │
│                                                                 │
│  server/export/                                                 │
│  └── excel.js          # XLSX export generation                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database (SQLite)                          │
│  seating.db                                                     │
│                                                                 │
│  Tables:                                                        │
│  ├── student_master      # All students (roll, name, branch)    │
│  ├── student_electives   # PE/OE subject choices per student    │
│  ├── subjects            # Subject catalog                      │
│  ├── branches            # Branch definitions (with section)    │
│  ├── year_branch_subjects # Year→Branch→Subject mappings        │
│  ├── exam_timetable      # Exam schedule (date, slot, subjects) │
│  ├── rooms               # Room definitions with bench layout   │
│  ├── exam_sessions       # Session configs (date, slot, mode)   │
│  ├── session_rooms       # Rooms assigned to sessions           │
│  ├── session_branch_subjects # Branch-subjects for sessions     │
│  └── students            # Students assigned to sessions        │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Student Import
```
XLSX → ConfigurationPage → /api/config/students/import → student_master
```

### 2. Elective Import
```
XLSX → ConfigurationPage → /api/config/electives/set → student_electives
```
- Links students to their PE/OE subject choices
- Uses roll_number to join with student_master

### 3. Timetable Import
```
XLSX → ConfigurationPage → /api/config/timetable → exam_timetable + year_branch_subjects
```
- Creates subjects if they don't exist
- Maps branches to subjects with type (REGULAR/PE/OE)

### 4. Session Creation
```
ConfigurationPage → Create Session
    → Auto-fetches branch-subjects from timetable
    → For electives: looks up student_electives
    → For regular: looks up student_master
    → Creates entries in students table
```

### 5. Allocation
```
SessionDetail → Run Allocation
    → allocator.js assigns seats
    → Updates students table with room/seat assignments
```

## Elective Subject Matching

### The Challenge
Timetable imports create subjects with full names like:
- "Professional Elective – II(Graph Theory)"
- "PE – II : Object Oriented System Development"

Elective imports create subjects with short names:
- "Graph Theory"
- "Object Oriented System Development"

### Solution: Enhanced Name Matching

`Configuration.getRollNumbersForElective()` extracts short names from prefixes:

```javascript
// Patterns to match:
// "PE – II : Object Oriented System Development" → "Object Oriented System Development"
// "Professional Elective – II(Graph Theory)" → "Graph Theory"
// "Open Elective - II : Entrepreneurship" → "Entrepreneurship"

const patterns = [
    /^(?:PE|Professional Elective|Open Elective)\s*[-–]\s*(?:I{1,3}|[123])\s*[:：]\s*(.+)$/i,
    /^(?:PE|Professional Elective|Open Elective)\s*[-–]\s*(?:I{1,3}|[123])\s*\((.+)\)$/i,
    /^(?:PE|Professional Elective|Open Elective)\s*[-–]\s*(?:I{1,3}|[123])\s*(.+)$/i
];
```

**Abbreviation Matching:**

If the extracted short name is an abbreviation (2-6 uppercase letters), the system also matches subjects where the first letters of words form that abbreviation:

```
"Professional Elective -III(SPM)" → extracts "SPM"
→ Matches "Software Project Management" (S-P-M = SPM)
```

The query then matches:
```sql
WHERE se.subject_id = ?
   OR UPPER(TRIM(s.subject_name)) LIKE '%' || UPPER(shortName) || '%'
   OR UPPER(shortName) LIKE '%' || UPPER(TRIM(s.subject_name)) || '%'
```

## Common Issues & Solutions

### Issue 1: "No students found for elective"

**Possible Causes:**
1. **No student_master data** - Students not imported
2. **No elective choices imported** - student_electives empty for branch
3. **Subject name mismatch** - Names don't match between timetable and electives
4. **Students chose different electives** - The subject on timetable wasn't chosen

**Diagnosis API:**
```
GET /api/config/diagnostics/elective-mismatch?year=3
```

Returns:
- Timetable electives (what's scheduled)
- Student electives (what students chose)
- Mismatches (subjects with no overlap)

**Enhanced Student API:**
```
GET /api/config/students?year=3&subjectId=341&branchId=91&enhanced=true
```

Returns:
```json
{
  "students": [],
  "meta": {
    "hasStudentMaster": true,
    "studentMasterCount": 278,
    "hasElectiveChoices": false,
    "electiveChoicesCount": 0,
    "reason": "no_elective_imports"
  }
}
```

### Issue 2: Wrong students included in electives

**Old Behavior (DANGEROUS):**
When elective lookup returned 0 students, system fell back to ALL branch students.

**New Behavior (CORRECT):**
No fallback. If no students chose an elective, that entry has 0 students.
Warning message clearly explains WHY:
- "CSE has 278 students, but no elective choices imported."
- "No students chose Graph Theory. Students may have chosen different electives."

### Issue 3: Timetable import skips all rows

**Cause:** Column mapping confusion
- "Academic Year" column (e.g., "2025-26(EVEN)") mapped to numeric "Year" field
- Server rejects non-numeric year values

**Solution:**
- Renamed UI: "Year (1-4, from data)" for numeric year
- Added separate: "Academic Year (e.g. 2025-26)" for text field
- academic_year column added to exam_timetable table

### Issue 4: Subject IDs change after re-import

**Cause:** Subjects get new IDs when re-created

**Impact:** year_branch_subjects and student_electives have stale IDs

**Prevention:**
- Import subjects once, or use "Replace" mode carefully
- Check `/api/config/diagnostics/elective-mismatch` after imports

## Database Schema

### student_master
```sql
CREATE TABLE student_master (
    id INTEGER PRIMARY KEY,
    roll_number TEXT UNIQUE NOT NULL,
    student_name TEXT,
    branch_code TEXT,
    section TEXT,
    year INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### student_electives
```sql
CREATE TABLE student_electives (
    id INTEGER PRIMARY KEY,
    roll_number TEXT NOT NULL,
    subject_id INTEGER NOT NULL,
    year INTEGER,
    elective_type TEXT,  -- 'PE' or 'OE'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### exam_timetable
```sql
CREATE TABLE exam_timetable (
    id INTEGER PRIMARY KEY,
    exam_date TEXT NOT NULL,
    slot TEXT,           -- 'FN' or 'AN'
    year INTEGER,
    branch_id INTEGER,
    subject_id INTEGER,
    semester INTEGER,
    academic_year TEXT,  -- e.g. "2025-26"
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### year_branch_subjects
```sql
CREATE TABLE year_branch_subjects (
    id INTEGER PRIMARY KEY,
    year INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    subject_type TEXT DEFAULT 'REGULAR',  -- 'REGULAR', 'PE', 'OE'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## API Reference

### Configuration APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/students` | GET | Get students (with enhanced mode) |
| `/api/config/students/import` | POST | Import student XLSX |
| `/api/config/electives/set` | POST | Import elective choices |
| `/api/config/timetable` | POST | Import exam timetable |
| `/api/config/diagnostics/elective-mismatch` | GET | Check elective mismatches |

### Session APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | POST | Create session |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id/allocate` | POST | Run allocation |
| `/api/sessions/:id/export/excel` | GET | Export to XLSX |

## Testing Checklist

### Before Creating Sessions
- [ ] Student master imported for all branches
- [ ] Elective choices imported for PE/OE subjects
- [ ] Timetable imported with correct subject mappings
- [ ] Check `/api/config/diagnostics/elective-mismatch` for issues

### Session Creation
- [ ] Correct date/slot/year selected
- [ ] Branch-subject mappings auto-populated from timetable
- [ ] Student counts show for each entry (not warnings)
- [ ] Rooms assigned

### Allocation
- [ ] Seating mode selected (SINGLE/DOUBLE)
- [ ] Run allocation
- [ ] Check report for unassigned students
- [ ] Export and verify XLSX

## Troubleshooting

### Debug Commands

Check database state:
```bash
node -e "const db = require('./server/db/connection').getDb(); ..."
```

Check elective matching:
```bash
node -e "
const ConfigurationModel = require('./server/models/Configuration');
const result = ConfigurationModel.getRollNumbersForElective(3, 341, 'CSE', null);
console.log(result.length, 'students');
"
```

Check what students chose:
```bash
node -e "
const db = require('./server/db/connection').getDb();
const r = db.prepare('SELECT DISTINCT s.subject_name, COUNT(*) as cnt FROM student_electives se JOIN subjects s ON s.id = se.subject_id GROUP BY se.subject_id').all();
console.table(r);
"
```

## Version History

### Latest Fixes (March 2026)

1. **Enhanced elective name matching** - Extracts short names from PE/OE prefixes
2. **Removed dangerous fallback** - No longer includes ALL students when elective lookup fails
3. **Better warning messages** - Distinguishes between:
   - No student master data
   - No elective choices imported
   - No students chose this subject
4. **Diagnostic endpoint** - `/api/config/diagnostics/elective-mismatch`
5. **Dynamic academic year** - Fetched from timetable, not hardcoded
6. **Semester in export** - Branch names include Roman numeral semester
