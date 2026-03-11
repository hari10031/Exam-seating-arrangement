/**
 * Diagnostic: check the full pipeline state
 */
const { getDb } = require('../db/connection');
const db = getDb();

// 1. What sessions exist?
const sessions = db.prepare('SELECT id, session_name, seating_mode, allocation_method FROM exam_sessions').all();
console.log('=== Sessions ===');
console.table(sessions);

if (sessions.length === 0) process.exit(0);
const sid = sessions[sessions.length - 1].id;
console.log('\nUsing session', sid);

// 2. What timetable entries drive this session?
const timetable = db.prepare(`
    SELECT et.id, et.branch_id, et.subject_id, b.branch_code, b.section, s.subject_name
    FROM exam_timetable et
    JOIN branches b ON b.id = et.branch_id
    JOIN subjects s ON s.id = et.subject_id
    ORDER BY b.branch_code, b.section
`).all();
console.log('\n=== Timetable entries ===');
console.table(timetable);

// 3. session_branch_subjects for this session
const sbs = db.prepare(`
    SELECT bs.branch_id, b.branch_code, b.section, bs.subject_id, s.subject_name
    FROM session_branch_subjects bs
    JOIN branches b ON b.id = bs.branch_id
    JOIN subjects s ON s.id = bs.subject_id
    WHERE bs.session_id = ?
`).all(sid);
console.log('\n=== Session branch_subjects ===');
console.table(sbs);

// 4. Students section distribution for this session
const stuSections = db.prepare(`
    SELECT b.branch_code, b.section, COUNT(*) as cnt
    FROM students st
    JOIN branches b ON b.id = st.branch_id
    WHERE st.session_id = ?
    GROUP BY b.branch_code, b.section
    ORDER BY b.branch_code, b.section
`).all(sid);
console.log('\n=== Student section distribution ===');
console.table(stuSections);

// 5. CSE boundary: what branch_ids do 064, 065, 128, 301, 307, 308 have?
const boundary = db.prepare(`
    SELECT st.roll_number, b.branch_code, b.section, st.branch_id
    FROM students st
    JOIN branches b ON b.id = st.branch_id
    WHERE st.session_id = ?
      AND b.branch_code = 'CSE'
      AND (st.roll_number LIKE '%733-064' OR st.roll_number LIKE '%733-065'
           OR st.roll_number LIKE '%733-128' OR st.roll_number LIKE '%733-129'
           OR st.roll_number LIKE '%733-301' OR st.roll_number LIKE '%733-307'
           OR st.roll_number LIKE '%733-308' OR st.roll_number LIKE '%733-314')
    ORDER BY st.roll_number
`).all(sid);
console.log('\n=== CSE boundary rolls ===');
console.table(boundary);

// 6. Current allocations around that boundary
const allocs = db.prepare(`
    SELECT sa.roll_number, sa.branch_code, sa.branch_section, sa.room_id, sa.row_number, sa.column_number
    FROM seat_allocations sa
    WHERE sa.session_id = ?
      AND sa.branch_code = 'CSE'
      AND (sa.roll_number LIKE '%733-064' OR sa.roll_number LIKE '%733-065'
           OR sa.roll_number LIKE '%733-128' OR sa.roll_number LIKE '%733-129'
           OR sa.roll_number LIKE '%733-301' OR sa.roll_number LIKE '%733-307'
           OR sa.roll_number LIKE '%733-308' OR sa.roll_number LIKE '%733-314')
    ORDER BY sa.roll_number
`).all(sid);
console.log('\n=== Allocations at boundary ===');
console.table(allocs);
