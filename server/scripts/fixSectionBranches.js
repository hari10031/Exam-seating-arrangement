/**
 * One-time script: Create section-specific branch entries from student_master data,
 * then update existing session students to use section-specific branch_ids.
 */
const { getDb } = require('../db/connection');
const db = getDb();

// 1. Find all unique branch_code + section combos in student_master
const combos = db.prepare(`
    SELECT DISTINCT branch_code, section 
    FROM student_master 
    WHERE section != '' AND section IS NOT NULL
    ORDER BY branch_code, section
`).all();
console.log('Section combos in student_master:', combos);

// 2. Create missing section-specific branches
const checkBranch = db.prepare('SELECT id FROM branches WHERE branch_code = ? AND section = ?');
const insertBranch = db.prepare('INSERT INTO branches (branch_code, branch_name, section) VALUES (?, ?, ?)');

for (const c of combos) {
    const existing = checkBranch.get(c.branch_code, c.section);
    if (!existing) {
        const r = insertBranch.run(c.branch_code, c.branch_code, c.section);
        console.log('Created branch:', c.branch_code, 'section:', c.section, 'id:', r.lastInsertRowid);
    } else {
        console.log('Already exists:', c.branch_code, 'section:', c.section, 'id:', existing.id);
    }
}

// Show all branches
const allBranches = db.prepare('SELECT id, branch_code, section FROM branches ORDER BY branch_code, section').all();
console.log('\nAll branches now:');
console.table(allBranches);

// 3. Fix existing students: update branch_id based on student_master section
const sessions = db.prepare('SELECT DISTINCT session_id FROM students').all();
console.log('\nSessions to fix:', sessions.map(s => s.session_id));

const lookupMaster = db.prepare('SELECT branch_code, section FROM student_master WHERE roll_number = ?');
const lookupSectionBranch = db.prepare('SELECT id FROM branches WHERE branch_code = ? AND section = ?');
const updateStudent = db.prepare('UPDATE students SET branch_id = ? WHERE id = ?');

const allStudents = db.prepare('SELECT id, roll_number, branch_id FROM students').all();
let fixed = 0;
for (const st of allStudents) {
    const master = lookupMaster.get(st.roll_number);
    if (master && master.section) {
        const secBranch = lookupSectionBranch.get(master.branch_code, master.section);
        if (secBranch && secBranch.id !== st.branch_id) {
            updateStudent.run(secBranch.id, st.id);
            fixed++;
        }
    }
}
console.log(`Fixed ${fixed} students with section-specific branch_ids`);

// Verify
const verify = db.prepare(`
    SELECT st.roll_number, b.branch_code, b.section, st.branch_id
    FROM students st
    JOIN branches b ON b.id = st.branch_id
    WHERE b.branch_code = 'CSE'
    ORDER BY st.roll_number
    LIMIT 10
`).all();
console.log('\nVerification (first 10 CSE students):');
console.table(verify);

// Check around the 064-065 boundary
const boundary = db.prepare(`
    SELECT st.roll_number, b.branch_code, b.section, st.branch_id
    FROM students st
    JOIN branches b ON b.id = st.branch_id
    WHERE b.branch_code = 'CSE' 
      AND (st.roll_number LIKE '%733-064' OR st.roll_number LIKE '%733-065' 
           OR st.roll_number LIKE '%733-301' OR st.roll_number LIKE '%733-307'
           OR st.roll_number LIKE '%733-308')
    ORDER BY st.roll_number
`).all();
console.log('\nBoundary check (064, 065, 301, 307, 308):');
console.table(boundary);
