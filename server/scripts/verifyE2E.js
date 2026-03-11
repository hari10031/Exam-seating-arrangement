/**
 * End-to-end verification: simulate creating a new session and check section flow.
 */
const { getDb } = require('../db/connection');
const db = getDb();
const ExamSessionModel = require('../models/ExamSession');
const ConfigurationModel = require('../models/Configuration');
const BranchModel = require('../models/Branch');

// Simulate what the POST /sessions endpoint does
const year = 3;
const examDate = '2026-03-18'; // pick a date that has timetable entries

// 1. Get timetable entries
const entries = ConfigurationModel.getExamTimetableByDate(examDate, 'FN');
const yearEntries = entries.filter(e => e.year === Number(year));
console.log('Timetable entries for', examDate, '(year', year, '):');
for (const e of yearEntries) {
    console.log(`  ${e.branch_code} (section="${e.branch_section || ''}") → ${e.subject_name}`);
}

// 2. Simulate the auto-populate section splitting
console.log('\n=== Section splitting ===');
for (const e of yearEntries) {
    const isElective = e.subject_type === 'PE' || e.subject_type === 'OE';
    if (!isElective) {
        const sectionGroups = ConfigurationModel.getRollNumbersBySection(Number(year), e.branch_code);
        for (const sg of sectionGroups) {
            let branchId = e.branch_id;
            if (sg.section) {
                let secBranch = BranchModel.getByCode(e.branch_code, sg.section);
                if (!secBranch) {
                    console.log(`  Would CREATE branch ${e.branch_code}-${sg.section}`);
                } else {
                    branchId = secBranch.id;
                }
            }
            console.log(`  ${e.branch_code} section="${sg.section}" → branchId=${branchId}, ${sg.rolls.length} students, first=${sg.rolls[0]?.roll_number}, last=${sg.rolls[sg.rolls.length - 1]?.roll_number}`);
        }
    } else {
        console.log(`  ${e.branch_code} → ELECTIVE: ${e.subject_name} (not split)`);
    }
}

// 3. Also verify groupByBranch would work correctly
console.log('\n=== Simulating groupByBranch with correct section data ===');
const sampleStudents = [];
const cseA = BranchModel.getByCode('CSE', 'A');
const cseB = BranchModel.getByCode('CSE', 'B');
if (cseA && cseB) {
    sampleStudents.push(
        { id: 1, roll_number: '2451-23-733-060', branch_code: 'CSE', branch_section: 'A', subject_name: 'CC' },
        { id: 2, roll_number: '2451-23-733-064', branch_code: 'CSE', branch_section: 'A', subject_name: 'CC' },
        { id: 3, roll_number: '2451-23-733-301', branch_code: 'CSE', branch_section: 'A', subject_name: 'CC' },
        { id: 4, roll_number: '2451-23-733-307', branch_code: 'CSE', branch_section: 'A', subject_name: 'CC' },
        { id: 5, roll_number: '2451-23-733-065', branch_code: 'CSE', branch_section: 'B', subject_name: 'CC' },
        { id: 6, roll_number: '2451-23-733-128', branch_code: 'CSE', branch_section: 'B', subject_name: 'CC' },
        { id: 7, roll_number: '2451-23-733-308', branch_code: 'CSE', branch_section: 'B', subject_name: 'CC' },
        { id: 8, roll_number: '2451-23-733-314', branch_code: 'CSE', branch_section: 'B', subject_name: 'CC' },
    );

    // Group same way as allocator
    const groups = {};
    for (const s of sampleStudents) {
        const section = s.branch_section || '';
        const key = section ? `${s.branch_code}-${section}` : s.branch_code;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    }
    for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => String(a.roll_number).localeCompare(String(b.roll_number)));
    }
    const branchOrder = Object.keys(groups).sort();
    for (const branch of branchOrder) {
        console.log(`  ${branch}: ${groups[branch].map(s => s.roll_number.slice(-3)).join(', ')}`);
    }
}

console.log('\nVerification complete!');
