/**
 * End-to-end test: Delete session 28, re-create it, and verify
 * that auto-populate properly creates section-specific student entries.
 */
const { getDb } = require('../db/connection');
const ExamSessionModel = require('../models/ExamSession');
const ConfigurationModel = require('../models/Configuration');
const BranchModel = require('../models/Branch');
const { allocateSeats } = require('../engine');

const db = getDb();

// 1. Capture session 28 details before deleting
const session28 = db.prepare('SELECT * FROM exam_sessions WHERE id = 28').get();
if (!session28) {
    console.log('Session 28 not found');
    process.exit(1);
}
console.log('Session 28:', session28.session_name, session28.exam_date, 'year:', session28.year, 'slot:', session28.slot);

// 2. Delete session 28
console.log('\n--- Deleting session 28 ---');
ExamSessionModel.delete(28);
console.log('Deleted.');

// 3. Re-create with same params (this triggers auto-populate)
console.log('\n--- Re-creating session ---');
const newSession = ExamSessionModel.create({
    sessionName: session28.session_name,
    examDate: session28.exam_date,
    startTime: session28.start_time,
    endTime: session28.end_time,
    seatingMode: session28.seating_mode,
    allocationMethod: session28.allocation_method,
    year: session28.year,
    slot: session28.slot
});
console.log('New session id:', newSession.id);

// 4. Auto-populate (same logic as sessions.js POST handler)
const entries = ConfigurationModel.getExamTimetableByDate(session28.exam_date, session28.slot || null);
const yearEntries = entries.filter(e => e.year === Number(session28.year));
console.log('Timetable entries for this date/slot:', yearEntries.length);

const studentEntries = [];
const branchSubjectMappings = [];
const baseMappings = yearEntries.map(e => ({
    branchId: e.branch_id,
    subjectId: e.subject_id
}));
ExamSessionModel.assignBranchSubjects(newSession.id, baseMappings);

for (const e of yearEntries) {
    const isElective = e.subject_type === 'PE' || e.subject_type === 'OE';
    if (isElective) {
        const students = ConfigurationModel.getRollNumbersForElective(Number(session28.year), e.subject_id);
        if (students.length > 0) {
            studentEntries.push({
                branchId: e.branch_id,
                subjectId: e.subject_id,
                rollNumbers: students.map(s => s.roll_number),
                exclude: [],
                include: []
            });
        }
    } else {
        const sectionGroups = ConfigurationModel.getRollNumbersBySection(Number(session28.year), e.branch_code);
        console.log(`  ${e.branch_code}: ${sectionGroups.length} section groups`);
        for (const sg of sectionGroups) {
            let branchId = e.branch_id;
            if (sg.section) {
                let secBranch = BranchModel.getByCode(e.branch_code, sg.section);
                if (!secBranch) {
                    secBranch = BranchModel.create({
                        branchCode: e.branch_code,
                        branchName: e.branch_code,
                        section: sg.section
                    });
                    console.log(`    Created new section branch: ${e.branch_code}-${sg.section} id=${secBranch.id}`);
                }
                branchId = secBranch.id;
                branchSubjectMappings.push({ branchId: secBranch.id, subjectId: e.subject_id });
            }
            if (sg.rolls.length > 0) {
                studentEntries.push({
                    branchId: branchId,
                    subjectId: e.subject_id,
                    rollNumbers: sg.rolls.map(s => s.roll_number),
                    exclude: [],
                    include: []
                });
                console.log(`    Section ${sg.section || '(none)'}: ${sg.rolls.length} students, branchId=${branchId}`);
            }
        }
    }
}

if (branchSubjectMappings.length > 0) {
    ExamSessionModel.assignBranchSubjects(newSession.id, branchSubjectMappings);
}
if (studentEntries.length > 0) {
    ExamSessionModel.setStudentsFromDb(newSession.id, studentEntries);
}

// 5. Verify distribution
const dist = db.prepare(`
    SELECT b.branch_code, b.section, COUNT(*) as cnt
    FROM students s JOIN branches b ON b.id = s.branch_id
    WHERE s.session_id = ?
    GROUP BY b.branch_code, b.section
    ORDER BY b.branch_code, b.section
`).all(newSession.id);
console.log('\n--- Student distribution in new session ---');
dist.forEach(d => console.log(`  ${d.branch_code}-${d.section || '(none)'}: ${d.cnt}`));

// 6. Assign rooms (same as original session)
const rooms = db.prepare("SELECT id FROM rooms ORDER BY room_code").all();
if (rooms.length > 0) {
    ExamSessionModel.assignRooms(newSession.id, rooms.map(r => r.id));
    console.log(`\nAssigned ${rooms.length} rooms`);
}

// 7. Run allocation
console.log('\n--- Running allocation ---');
const details = ExamSessionModel.getFullDetails(newSession.id);
const result = allocateSeats(details);
console.log(`Allocation: ${result.allocations.length} seats allocated`);

// 8. Check allocation order for CSE students
const cseAllocations = result.allocations.filter(a => a.branch_code === 'CSE');
console.log(`CSE allocations: ${cseAllocations.length}`);

// Group by section to verify contiguity 
let lastSection = null;
let transitions = [];
for (let i = 0; i < cseAllocations.length; i++) {
    const a = cseAllocations[i];
    if (a.branchSection !== lastSection) {
        transitions.push({ from: lastSection, to: a.branchSection, index: i, roll: a.roll_number });
        lastSection = a.branchSection;
    }
}
console.log('\nSection transitions:');
transitions.forEach(t => console.log(`  At index ${t.index}: ${t.from || 'start'} -> ${t.to}, roll=${t.roll}`));

// Verify each section is contiguous (no interleaving between sections)
const sectionOrder = transitions.map(t => t.to);
const uniqueSections = [...new Set(sectionOrder)];
if (sectionOrder.length === uniqueSections.length) {
    console.log('\n✓ PASS: Each section appears exactly once — sections are contiguous!');
} else {
    console.log('\n✗ FAIL: Sections are interleaved or repeated!');
    console.log('  Section order:', sectionOrder.join(' → '));
}

// Show boundary rolls
console.log('\nBoundary details:');
for (const t of transitions) {
    const a = cseAllocations[t.index];
    console.log(`  Section ${t.to} starts: roll=${a.roll_number} room=${a.room_code}`);
    // Find the last student in this section
    const nextTransitionIdx = transitions.find(tt => tt.index > t.index);
    const endIdx = nextTransitionIdx ? nextTransitionIdx.index - 1 : cseAllocations.length - 1;
    const last = cseAllocations[endIdx];
    console.log(`  Section ${t.to} ends:   roll=${last.roll_number} room=${last.room_code} (${endIdx - t.index + 1} students)`);
}

console.log('\nDone! New session id:', newSession.id);
