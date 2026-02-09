/**
 * ALLOCATION ENGINE — UNIT TESTS
 * ===============================
 * Tests for both SINGLE and DOUBLE mode allocation,
 * edge cases, and validation logic.
 */
const {
    allocateSeats,
    buildDifferentSubjectPairs,
    roundRobinInterleave,
    groupBySubject
} = require('../server/engine/allocator');
const { validateAllocation } = require('../server/engine/validator');

// ── HELPERS ────────────────────────────────────────────────

function makeStudent(id, roll, branch, subject) {
    return { id, roll_number: String(roll), branch_code: branch, subject_name: subject, branch_id: 1, subject_id: 1 };
}

function makeRoom(id, code, rows, cols) {
    return { id, room_code: code, rows, columns: cols };
}

// ── SINGLE MODE TESTS ─────────────────────────────────────

describe('SINGLE Mode Allocation', () => {
    test('assigns all students when capacity is sufficient', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)]; // 9 benches
        const students = [];
        for (let i = 1; i <= 6; i++) {
            students.push(makeStudent(i, 100 + i, 'CSE', 'DS'));
        }

        const { allocations, report } = allocateSeats({ rooms, students, mode: 'SINGLE' });

        expect(report.assignedCount).toBe(6);
        expect(report.unassignedCount).toBe(0);
        expect(allocations).toHaveLength(6);
        // All seats should be position A
        expect(allocations.every(a => a.seatPosition === 'A')).toBe(true);
    });

    test('reports unassigned when capacity exceeded', () => {
        const rooms = [makeRoom(1, 'R1', 1, 2)]; // 2 benches only
        const students = [];
        for (let i = 1; i <= 5; i++) {
            students.push(makeStudent(i, 100 + i, 'CSE', 'DS'));
        }

        const { report } = allocateSeats({ rooms, students, mode: 'SINGLE' });

        expect(report.assignedCount).toBe(2);
        expect(report.unassignedCount).toBe(3);
        expect(report.unassignedReasons).toHaveLength(3);
        expect(report.unassignedReasons[0].reason).toBe('INSUFFICIENT_CAPACITY');
    });

    test('interleaves different subjects', () => {
        const rooms = [makeRoom(1, 'R1', 2, 3)]; // 6 benches
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '103', 'CSE', 'DS'),
            makeStudent(4, '201', 'CSIT', 'SPM'),
            makeStudent(5, '202', 'CSIT', 'SPM'),
            makeStudent(6, '301', 'AIML', 'MATH'),
        ];

        const { allocations } = allocateSeats({ rooms, students, mode: 'SINGLE' });

        // Check that we don't have consecutive same subjects in first few seats
        expect(allocations[0].subjectName).not.toBe(allocations[1].subjectName);
    });
});

// ── DOUBLE MODE TESTS ─────────────────────────────────────

describe('DOUBLE Mode Allocation', () => {
    test('pairs students with different subjects', () => {
        const rooms = [makeRoom(1, 'R1', 2, 2)]; // 4 benches = 8 seats
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '201', 'CSIT', 'SPM'),
            makeStudent(4, '202', 'CSIT', 'SPM'),
        ];

        const { allocations, report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });

        expect(report.assignedCount).toBe(4);

        // Group allocations by bench
        const benches = {};
        for (const a of allocations) {
            const key = `${a.rowNumber}-${a.columnNumber}`;
            if (!benches[key]) benches[key] = {};
            benches[key][a.seatPosition] = a;
        }

        // Every bench with two students must have different subjects
        for (const bench of Object.values(benches)) {
            if (bench.A && bench.B) {
                expect(bench.A.subjectName).not.toBe(bench.B.subjectName);
            }
        }
    });

    test('handles single subject gracefully (students sit alone)', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)]; // 9 benches
        const students = [];
        for (let i = 1; i <= 5; i++) {
            students.push(makeStudent(i, 100 + i, 'CSE', 'DS'));
        }

        const { allocations, report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });

        expect(report.assignedCount).toBe(5);
        // All should be seat A only (no B pairs possible)
        expect(allocations.every(a => a.seatPosition === 'A')).toBe(true);
    });

    test('handles uneven subject counts', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)]; // 25 benches
        const students = [];
        // 10 DS students, 3 SPM students
        for (let i = 1; i <= 10; i++) students.push(makeStudent(i, 100 + i, 'CSE', 'DS'));
        for (let i = 11; i <= 13; i++) students.push(makeStudent(i, 200 + i, 'CSIT', 'SPM'));

        const { allocations, report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });

        expect(report.assignedCount).toBe(13);
        expect(report.unassignedCount).toBe(0);

        // Only 3 pairs possible (3 SPM), 7 solos (remaining DS)
        const seatBCount = allocations.filter(a => a.seatPosition === 'B').length;
        expect(seatBCount).toBe(3);
    });

    test('zero students produces empty result', () => {
        const rooms = [makeRoom(1, 'R1', 2, 2)];
        const { allocations, report } = allocateSeats({ rooms, students: [], mode: 'DOUBLE' });

        expect(allocations).toHaveLength(0);
        expect(report.totalStudents).toBe(0);
        expect(report.assignedCount).toBe(0);
    });
});

// ── PAIRING ALGORITHM TESTS ──────────────────────────────

describe('buildDifferentSubjectPairs', () => {
    test('maximises pairs with 3 subjects', () => {
        const groups = {
            'DS': [makeStudent(1, '1', 'A', 'DS'), makeStudent(2, '2', 'A', 'DS'), makeStudent(3, '3', 'A', 'DS')],
            'SPM': [makeStudent(4, '4', 'B', 'SPM'), makeStudent(5, '5', 'B', 'SPM')],
            'MATH': [makeStudent(6, '6', 'C', 'MATH')]
        };

        const { pairs, solos } = buildDifferentSubjectPairs(groups);

        expect(pairs).toHaveLength(3); // All 6 students can be paired
        expect(solos).toHaveLength(0);

        // Verify all pairs have different subjects
        for (const pair of pairs) {
            expect(pair.a.subject_name).not.toBe(pair.b.subject_name);
        }
    });

    test('handles single subject → all solos', () => {
        const groups = {
            'DS': [makeStudent(1, '1', 'A', 'DS'), makeStudent(2, '2', 'A', 'DS')]
        };

        const { pairs, solos } = buildDifferentSubjectPairs(groups);
        expect(pairs).toHaveLength(0);
        expect(solos).toHaveLength(2);
    });
});

// ── INTERLEAVING TESTS ───────────────────────────────────

describe('roundRobinInterleave', () => {
    test('alternates subjects', () => {
        const groups = {
            'DS': [makeStudent(1, '1', 'A', 'DS'), makeStudent(2, '2', 'A', 'DS'), makeStudent(3, '3', 'A', 'DS')],
            'SPM': [makeStudent(4, '4', 'B', 'SPM'), makeStudent(5, '5', 'B', 'SPM')]
        };

        const result = roundRobinInterleave(groups);

        expect(result).toHaveLength(5);
        // First two should be different subjects
        expect(result[0].subject_name).not.toBe(result[1].subject_name);
    });
});

// ── VALIDATOR TESTS ──────────────────────────────────────

describe('Validator', () => {
    test('detects duplicate student assignment', () => {
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' },
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 2, seatPosition: 'A', subjectName: 'DS' },
        ];
        const students = [makeStudent(1, '101', 'CSE', 'DS')];
        const report = { totalStudents: 1, assignedCount: 2, unassignedCount: 0 };
        const rooms = [makeRoom(1, 'R1', 2, 2)];

        const result = validateAllocation({ allocations, students, report, mode: 'SINGLE', rooms });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('DUPLICATE_STUDENT'))).toBe(true);
    });

    test('detects same-subject pair in DOUBLE mode', () => {
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' },
            { studentId: 2, rollNumber: '102', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'B', subjectName: 'DS' },
        ];
        const students = [makeStudent(1, '101', 'CSE', 'DS'), makeStudent(2, '102', 'CSE', 'DS')];
        const report = { totalStudents: 2, assignedCount: 2, unassignedCount: 0 };
        const rooms = [makeRoom(1, 'R1', 2, 2)];

        const result = validateAllocation({ allocations, students, report, mode: 'DOUBLE', rooms });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('SAME_SUBJECT_PAIR'))).toBe(true);
    });

    test('passes valid DOUBLE allocation', () => {
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' },
            { studentId: 2, rollNumber: '201', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'B', subjectName: 'SPM' },
        ];
        const students = [makeStudent(1, '101', 'CSE', 'DS'), makeStudent(2, '201', 'CSIT', 'SPM')];
        const report = { totalStudents: 2, assignedCount: 2, unassignedCount: 0 };
        const rooms = [makeRoom(1, 'R1', 2, 2)];

        const result = validateAllocation({ allocations, students, report, mode: 'DOUBLE', rooms });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});
