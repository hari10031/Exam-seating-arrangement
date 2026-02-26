/**
 * SEED SCRIPT
 * ===========
 * Populates the database with sample data for testing.
 * Run: npm run seed
 */
const { getDb, closeDb } = require('../db/connection');
const RoomModel = require('../models/Room');
const BranchModel = require('../models/Branch');
const SubjectModel = require('../models/Subject');
const ExamSessionModel = require('../models/ExamSession');

function seed() {
    console.log('🌱 Seeding database...\n');

    // ── ROOMS ──────────────────────────────────────────────────
    const rooms = [
        { roomCode: 'AS201', rows: 5, columns: 6 },
        { roomCode: 'AS202', rows: 4, columns: 5 },
        { roomCode: 'LH101', rows: 6, columns: 8 },
    ];
    const createdRooms = rooms.map(r => {
        try { return RoomModel.create(r); }
        catch { return RoomModel.getByCode(r.roomCode); }
    });
    console.log(`  Rooms: ${createdRooms.map(r => r.room_code).join(', ')}`);

    // ── BRANCHES ───────────────────────────────────────────────
    const branches = [
        { branchCode: 'CSE', branchName: 'Computer Science & Engineering' },
        { branchCode: 'CSIT', branchName: 'CS & Information Technology' },
        { branchCode: 'CSE-AIML', branchName: 'CSE (AI & Machine Learning)' },
    ];
    const createdBranches = branches.map(b => {
        try { return BranchModel.create(b); }
        catch { return BranchModel.getByCode(b.branchCode); }
    });
    console.log(`  Branches: ${createdBranches.map(b => b.branch_code).join(', ')}`);

    // ── SUBJECTS ───────────────────────────────────────────────
    const subjects = [
        { subjectCode: 'CS301', subjectName: 'Data Structures' },
        { subjectCode: 'CS302', subjectName: 'Software Project Management' },
        { subjectCode: 'MA301', subjectName: 'Mathematics-III' },
    ];
    const createdSubjects = subjects.map(s => {
        try { return SubjectModel.create(s); }
        catch { return SubjectModel.getByCode(s.subjectCode); }
    });
    console.log(`  Subjects: ${createdSubjects.map(s => s.subject_name).join(', ')}`);

    // ── EXAM SESSION ───────────────────────────────────────────
    const session = ExamSessionModel.create({
        sessionName: 'Mid-Sem Dec 2025 – Slot A',
        examDate: '2025-12-15',
        startTime: '09:00',
        endTime: '12:00',
        seatingMode: 'DOUBLE'
    });
    console.log(`  Session: ${session.session_name} (ID: ${session.id})`);

    // Assign rooms
    ExamSessionModel.assignRooms(session.id, createdRooms.map(r => r.id));

    // Assign branch-subject mappings
    ExamSessionModel.assignBranchSubjects(session.id, [
        { branchId: createdBranches[0].id, subjectId: createdSubjects[0].id }, // CSE → DS
        { branchId: createdBranches[1].id, subjectId: createdSubjects[1].id }, // CSIT → SPM
        { branchId: createdBranches[2].id, subjectId: createdSubjects[2].id }, // CSE-AIML → M-III
    ]);

    // Add students with roll number ranges
    // Uses the new hyphenated format (XXXX-XX-XXX-NNN)
    ExamSessionModel.setStudents(session.id, [
        {
            branchId: createdBranches[0].id,
            subjectId: createdSubjects[0].id,
            ranges: [{ start: '2451-23-733-001', end: '2451-23-733-030' }],
            exclude: ['2451-23-733-015', '2451-23-733-020'],
            include: ['2451-23-733-099']
        },
        {
            branchId: createdBranches[1].id,
            subjectId: createdSubjects[1].id,
            ranges: [{ start: '2451-23-751-001', end: '2451-23-751-025' }],
            exclude: ['2451-23-751-010'],
            include: []
        },
        {
            branchId: createdBranches[2].id,
            subjectId: createdSubjects[2].id,
            ranges: [{ start: '2451-23-749-001', end: '2451-23-749-020' }],
            exclude: [],
            include: ['2451-23-749-050']
        }
    ]);

    const students = ExamSessionModel.getStudents(session.id);
    console.log(`  Students loaded: ${students.length}`);

    console.log('\n✅ Seed complete! Session ID:', session.id);
    console.log('   Run the allocation via: POST /api/sessions/' + session.id + '/allocate\n');
}

try {
    seed();
} finally {
    closeDb();
}
