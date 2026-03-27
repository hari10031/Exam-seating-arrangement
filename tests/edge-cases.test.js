/**
 * EDGE CASE TESTS
 * ================
 * Comprehensive tests for the Exam Seating Arrangement System.
 * Covers allocation engine edge cases, roll-number expansion,
 * pairing/interleaving algorithms, validator, and utility helpers.
 */
const {
    allocateSeats,
    allocateSingle,
    allocateDouble,
    allocateLinearSingle,
    allocateLinearDouble,
    buildDifferentSubjectPairs,
    roundRobinInterleave,
    buildSeatSlots,
    groupBySubject,
    groupByBranch
} = require('../server/engine/allocator');
const { validateAllocation } = require('../server/engine/validator');
const { expandRolls, expandHyphenatedRange } = require('../server/models/ExamSession');

// ── HELPERS ────────────────────────────────────────────────

function makeStudent(id, roll, branch, subject, branchId = 1, subjectId = 1) {
    return {
        id, roll_number: String(roll), branch_code: branch,
        subject_name: subject, branch_id: branchId, subject_id: subjectId
    };
}

function makeRoom(id, code, rows, cols) {
    return { id, room_code: code, rows, columns: cols };
}

// ═══════════════════════════════════════════════════════════════
//  1. ROLL NUMBER EXPANSION — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Roll Number Expansion', () => {
    describe('expandHyphenatedRange', () => {
        test('expands standard university roll range', () => {
            const rolls = expandHyphenatedRange('2451-23-733-001', '2451-23-733-005');
            expect(rolls).toEqual([
                '2451-23-733-001', '2451-23-733-002', '2451-23-733-003',
                '2451-23-733-004', '2451-23-733-005'
            ]);
        });

        test('single roll (start === end)', () => {
            const rolls = expandHyphenatedRange('2451-23-733-010', '2451-23-733-010');
            expect(rolls).toEqual(['2451-23-733-010']);
        });

        test('preserves leading zeros in suffix', () => {
            const rolls = expandHyphenatedRange('2451-23-733-008', '2451-23-733-012');
            expect(rolls[0]).toBe('2451-23-733-008');
            expect(rolls[4]).toBe('2451-23-733-012');
            // All should have 3-digit suffix
            rolls.forEach(r => {
                const suffix = r.split('-')[3];
                expect(suffix.length).toBe(3);
            });
        });

        test('throws on prefix mismatch', () => {
            expect(() => {
                expandHyphenatedRange('2451-23-733-001', '2451-23-734-010');
            }).toThrow('Prefix mismatch');
        });

        test('throws when start > end', () => {
            expect(() => {
                expandHyphenatedRange('2451-23-733-020', '2451-23-733-005');
            }).toThrow('Start suffix');
        });

        test('throws on wrong number of blocks', () => {
            expect(() => {
                expandHyphenatedRange('2451-23-001', '2451-23-010');
            }).toThrow('expected 4 dash-separated blocks');
        });

        test('throws on non-numeric suffix', () => {
            expect(() => {
                expandHyphenatedRange('2451-23-733-ABC', '2451-23-733-DEF');
            }).toThrow('Non-numeric suffix');
        });

        test('handles large range', () => {
            const rolls = expandHyphenatedRange('2451-24-748-001', '2451-24-748-070');
            expect(rolls).toHaveLength(70);
            expect(rolls[0]).toBe('2451-24-748-001');
            expect(rolls[69]).toBe('2451-24-748-070');
        });

        test('handles suffix width mismatch (01 vs 100)', () => {
            const rolls = expandHyphenatedRange('2451-23-733-01', '2451-23-733-100');
            // Width should be max(2,3)=3
            expect(rolls[0]).toBe('2451-23-733-001');
            expect(rolls[99]).toBe('2451-23-733-100');
        });
    });

    describe('expandRolls', () => {
        test('plain integer range', () => {
            const rolls = expandRolls([{ start: 101, end: 105 }]);
            expect(rolls).toEqual(['101', '102', '103', '104', '105']);
        });

        test('excludes specified rolls', () => {
            const rolls = expandRolls(
                [{ start: '2451-23-733-001', end: '2451-23-733-005' }],
                ['2451-23-733-003']
            );
            expect(rolls).toHaveLength(4);
            expect(rolls).not.toContain('2451-23-733-003');
        });

        test('includes extra rolls', () => {
            const rolls = expandRolls(
                [{ start: 101, end: 103 }],
                [],
                ['200', '201']
            );
            expect(rolls).toHaveLength(5);
            expect(rolls).toContain('200');
            expect(rolls).toContain('201');
        });

        test('include does not duplicate existing rolls', () => {
            const rolls = expandRolls(
                [{ start: 101, end: 103 }],
                [],
                ['102']  // already in range
            );
            expect(rolls).toHaveLength(3);
        });

        test('exclude + include combined', () => {
            const rolls = expandRolls(
                [{ start: 101, end: 105 }],
                ['103'],   // remove 103
                ['999']     // add 999
            );
            expect(rolls).toHaveLength(5); // 5 - 1 + 1 = 5
            expect(rolls).not.toContain('103');
            expect(rolls).toContain('999');
        });

        test('multiple ranges merged', () => {
            const rolls = expandRolls([
                { start: 101, end: 103 },
                { start: 201, end: 202 }
            ]);
            expect(rolls).toHaveLength(5);
            expect(rolls).toContain('101');
            expect(rolls).toContain('202');
        });

        test('empty ranges returns only includes', () => {
            const rolls = expandRolls([], [], ['ABC-001']);
            expect(rolls).toEqual(['ABC-001']);
        });

        test('throws on invalid plain range (start > end)', () => {
            expect(() => {
                expandRolls([{ start: 200, end: 100 }]);
            }).toThrow('greater than');
        });

        test('sorts hyphenated rolls by suffix numerically', () => {
            const rolls = expandRolls([
                { start: '2451-23-733-008', end: '2451-23-733-012' }
            ]);
            for (let i = 1; i < rolls.length; i++) {
                const prev = parseInt(rolls[i - 1].split('-')[3], 10);
                const curr = parseInt(rolls[i].split('-')[3], 10);
                expect(curr).toBeGreaterThan(prev);
            }
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  2. SINGLE MODE — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('SINGLE Mode — Edge Cases', () => {
    test('zero rooms → all unassigned', () => {
        const students = [makeStudent(1, '101', 'CSE', 'DS')];
        const { report } = allocateSeats({ rooms: [], students, mode: 'SINGLE' });
        expect(report.assignedCount).toBe(0);
        expect(report.unassignedCount).toBe(1);
    });

    test('zero students → empty allocation', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)];
        const { allocations, report } = allocateSeats({ rooms, students: [], mode: 'SINGLE' });
        expect(allocations).toHaveLength(0);
        expect(report.totalStudents).toBe(0);
        expect(report.assignedCount).toBe(0);
    });

    test('exact capacity fill', () => {
        const rooms = [makeRoom(1, 'R1', 2, 3)]; // 6 seats
        const students = [];
        for (let i = 1; i <= 6; i++) students.push(makeStudent(i, 100 + i, 'CSE', 'DS'));
        const { report } = allocateSeats({ rooms, students, mode: 'SINGLE' });
        expect(report.assignedCount).toBe(6);
        expect(report.unassignedCount).toBe(0);
    });

    test('one student over capacity', () => {
        const rooms = [makeRoom(1, 'R1', 1, 1)]; // 1 seat
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS')
        ];
        const { report } = allocateSeats({ rooms, students, mode: 'SINGLE' });
        expect(report.assignedCount).toBe(1);
        expect(report.unassignedCount).toBe(1);
    });

    test('single student assigned correctly', () => {
        const rooms = [makeRoom(1, 'R1', 1, 1)];
        const students = [makeStudent(1, '101', 'CSE', 'DS')];
        const { allocations, report } = allocateSeats({ rooms, students, mode: 'SINGLE' });
        expect(report.assignedCount).toBe(1);
        expect(allocations[0].rollNumber).toBe('101');
        expect(allocations[0].seatPosition).toBe('A');
        expect(allocations[0].rowNumber).toBe(1);
        expect(allocations[0].columnNumber).toBe(1);
    });

    test('multiple rooms fill sequentially', () => {
        const rooms = [
            makeRoom(1, 'A1', 1, 2),  // 2 seats
            makeRoom(2, 'B1', 1, 2),  // 2 seats
        ];
        const students = [];
        for (let i = 1; i <= 4; i++) students.push(makeStudent(i, 100 + i, 'CSE', 'DS'));
        const { allocations } = allocateSeats({ rooms, students, mode: 'SINGLE' });

        // First 2 in room A1, next 2 in room B1
        expect(allocations[0].roomId).toBe(1);
        expect(allocations[1].roomId).toBe(1);
        expect(allocations[2].roomId).toBe(2);
        expect(allocations[3].roomId).toBe(2);
    });

    test('rooms sorted by room_code', () => {
        const rooms = [
            makeRoom(2, 'Z1', 1, 1),
            makeRoom(1, 'A1', 1, 1),
        ];
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS')
        ];
        const { allocations } = allocateSeats({ rooms, students, mode: 'SINGLE' });
        // A1 should come first
        expect(allocations[0].roomId).toBe(1);
        expect(allocations[1].roomId).toBe(2);
    });

    test('many subjects interleaved correctly', () => {
        const rooms = [makeRoom(1, 'R1', 4, 4)]; // 16 seats
        const students = [
            ...Array.from({ length: 4 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 4 }, (_, i) => makeStudent(i + 5, 200 + i, 'CSIT', 'SPM')),
            ...Array.from({ length: 4 }, (_, i) => makeStudent(i + 9, 300 + i, 'CIC', 'MATH')),
            ...Array.from({ length: 4 }, (_, i) => makeStudent(i + 13, 400 + i, 'CSD', 'OS')),
        ];
        const { allocations, report } = allocateSeats({ rooms, students, mode: 'SINGLE' });
        expect(report.assignedCount).toBe(16);

        // No two consecutive seats should have same subject
        for (let i = 1; i < allocations.length; i++) {
            if (allocations[i].roomId === allocations[i - 1].roomId) {
                expect(allocations[i].subjectName).not.toBe(allocations[i - 1].subjectName);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  3. DOUBLE MODE — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('DOUBLE Mode — Edge Cases', () => {
    test('zero rooms → all unassigned', () => {
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '201', 'CSIT', 'SPM')
        ];
        const { report } = allocateSeats({ rooms: [], students, mode: 'DOUBLE' });
        expect(report.assignedCount).toBe(0);
        expect(report.unassignedCount).toBe(2);
    });

    test('exact pairs fill all benches', () => {
        const rooms = [makeRoom(1, 'R1', 1, 3)]; // 3 benches = 6 seats
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '103', 'CSE', 'DS'),
            makeStudent(4, '201', 'CSIT', 'SPM'),
            makeStudent(5, '202', 'CSIT', 'SPM'),
            makeStudent(6, '203', 'CSIT', 'SPM'),
        ];
        const { report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        expect(report.assignedCount).toBe(6);
        expect(report.unassignedCount).toBe(0);
    });

    test('odd number of students with 2 subjects', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)]; // 9 benches
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '103', 'CSE', 'DS'),
            makeStudent(4, '201', 'CSIT', 'SPM'),
            makeStudent(5, '202', 'CSIT', 'SPM'),
        ];
        const { report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        expect(report.assignedCount).toBe(5);
        expect(report.unassignedCount).toBe(0);
    });

    test('3 subjects pair optimally', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)]; // 25 benches
        const students = [
            ...Array.from({ length: 5 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 3 }, (_, i) => makeStudent(i + 6, 200 + i, 'CSIT', 'SPM')),
            ...Array.from({ length: 2 }, (_, i) => makeStudent(i + 9, 300 + i, 'CIC', 'MATH')),
        ];
        const { allocations, report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        expect(report.assignedCount).toBe(10);

        // All pairs with 2 students should have different subjects
        const benches = {};
        allocations.forEach(a => {
            const key = `${a.rowNumber}-${a.columnNumber}`;
            if (!benches[key]) benches[key] = {};
            benches[key][a.seatPosition] = a;
        });
        Object.values(benches).forEach(bench => {
            if (bench.A && bench.B) {
                expect(bench.A.subjectName).not.toBe(bench.B.subjectName);
            }
        });
    });

    test('large imbalance: 50 DS + 2 SPM', () => {
        const rooms = [makeRoom(1, 'R1', 10, 10)]; // 100 benches
        const students = [
            ...Array.from({ length: 50 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 2 }, (_, i) => makeStudent(i + 51, 200 + i, 'CSIT', 'SPM')),
        ];
        const { allocations, report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        expect(report.assignedCount).toBe(52);

        // Should have 2 pairs + 48 solos
        const seatB = allocations.filter(a => a.seatPosition === 'B');
        expect(seatB).toHaveLength(2);
    });

    test('double mode with insufficient benches', () => {
        const rooms = [makeRoom(1, 'R1', 1, 1)]; // 1 bench = 2 seats
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '201', 'CSIT', 'SPM'),
            makeStudent(3, '102', 'CSE', 'DS'),
            makeStudent(4, '202', 'CSIT', 'SPM'),
        ];
        const { report } = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        expect(report.assignedCount).toBe(2);
        expect(report.unassignedCount).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════════
//  4. LINEAR MODE — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('LINEAR SINGLE Mode', () => {
    test('students grouped by branch contiguously', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)]; // 9 seats
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '103', 'CSE', 'DS'),
            makeStudent(4, '201', 'CSIT', 'SPM'),
            makeStudent(5, '202', 'CSIT', 'SPM'),
        ];
        const { allocations } = allocateSeats({
            rooms, students, mode: 'SINGLE', allocationMethod: 'LINEAR'
        });

        // CSE students should be contiguous, then CSIT
        const branches = allocations.map(a => a.branchCode);
        const cseEnd = branches.lastIndexOf('CSE');
        const csitStart = branches.indexOf('CSIT');
        expect(csitStart).toBeGreaterThan(cseEnd);
    });

    test('spans multiple rooms', () => {
        const rooms = [
            makeRoom(1, 'A1', 1, 2), // 2 seats
            makeRoom(2, 'B1', 1, 2), // 2 seats
        ];
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '103', 'CSE', 'DS'),
        ];
        const { allocations } = allocateSeats({
            rooms, students, mode: 'SINGLE', allocationMethod: 'LINEAR'
        });
        // First 2 in room A1, 3rd in room B1
        expect(allocations[0].roomId).toBe(1);
        expect(allocations[1].roomId).toBe(1);
        expect(allocations[2].roomId).toBe(2);
    });
});

describe('LINEAR DOUBLE Mode', () => {
    test('different branches on same bench', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)]; // 9 benches
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '103', 'CSE', 'DS'),
            makeStudent(4, '201', 'CSIT', 'SPM'),
            makeStudent(5, '202', 'CSIT', 'SPM'),
            makeStudent(6, '203', 'CSIT', 'SPM'),
        ];
        const { allocations } = allocateSeats({
            rooms, students, mode: 'DOUBLE', allocationMethod: 'LINEAR'
        });

        // Group by bench and check A/B have different branches
        const benches = {};
        allocations.forEach(a => {
            const key = `${a.rowNumber}-${a.columnNumber}`;
            if (!benches[key]) benches[key] = {};
            benches[key][a.seatPosition] = a;
        });
        Object.values(benches).forEach(bench => {
            if (bench.A && bench.B) {
                expect(bench.A.branchCode).not.toBe(bench.B.branchCode);
            }
        });
    });

    test('single branch in linear double → auto-switches to SINGLE', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)];
        const students = Array.from({ length: 5 }, (_, i) =>
            makeStudent(i + 1, 100 + i, 'CSE', 'DS')
        );
        const { allocations, report } = allocateSeats({
            rooms, students, mode: 'DOUBLE', allocationMethod: 'LINEAR'
        });
        expect(report.assignedCount).toBe(5);
        // Auto-switched to SINGLE: all seat A, no seat B
        expect(allocations.every(a => a.seatPosition === 'A')).toBe(true);
        expect(report.modeAutoSwitched).toBe(true);
        expect(report.modeAutoSwitchedReason).toContain('SINGLE');
    });

    test('same-subject branches paired with different-subject branch, not each other', () => {
        // CIC and CSD have same subject (Maths), CSE has different (Physics)
        const rooms = [makeRoom(1, 'R1', 5, 5)]; // 25 benches
        const students = [
            ...Array.from({ length: 5 }, (_, i) => makeStudent(i + 1, 100 + i, 'CIC', 'Maths')),
            ...Array.from({ length: 5 }, (_, i) => makeStudent(i + 6, 200 + i, 'CSD', 'Maths')),
            ...Array.from({ length: 10 }, (_, i) => makeStudent(i + 11, 300 + i, 'CSE', 'Physics')),
        ];
        const { allocations } = allocateSeats({
            rooms, students, mode: 'DOUBLE', allocationMethod: 'LINEAR'
        });

        // Group by bench and check no same-subject pairs
        const benches = {};
        allocations.forEach(a => {
            const key = `${a.rowNumber}-${a.columnNumber}`;
            if (!benches[key]) benches[key] = {};
            benches[key][a.seatPosition] = a;
        });
        Object.values(benches).forEach(bench => {
            if (bench.A && bench.B) {
                expect(bench.A.subjectName).not.toBe(bench.B.subjectName);
            }
        });
    });

    test('all branches same subject in DOUBLE → auto-switch to SINGLE', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)];
        const students = [
            ...Array.from({ length: 5 }, (_, i) => makeStudent(i + 1, 100 + i, 'CIC', 'Maths')),
            ...Array.from({ length: 5 }, (_, i) => makeStudent(i + 6, 200 + i, 'CSD', 'Maths')),
            ...Array.from({ length: 5 }, (_, i) => makeStudent(i + 11, 300 + i, 'CSE', 'Maths')),
        ];
        const { allocations, report } = allocateSeats({
            rooms, students, mode: 'DOUBLE', allocationMethod: 'LINEAR'
        });
        expect(report.modeAutoSwitched).toBe(true);
        expect(report.modeAutoSwitchedReason).toContain('Maths');
        expect(report.assignedCount).toBe(15);
        // All seat A since auto-switched to SINGLE
        expect(allocations.every(a => a.seatPosition === 'A')).toBe(true);
    });

    test('all same subject in INTERLEAVED DOUBLE → auto-switch to SINGLE', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)];
        const students = [
            ...Array.from({ length: 10 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
        ];
        const { report } = allocateSeats({
            rooms, students, mode: 'DOUBLE', allocationMethod: 'INTERLEAVED'
        });
        expect(report.modeAutoSwitched).toBe(true);
        expect(report.assignedCount).toBe(10);
    });
});

// ═══════════════════════════════════════════════════════════════
//  5. SEAT SLOT GENERATION
// ═══════════════════════════════════════════════════════════════

describe('buildSeatSlots', () => {
    test('generates correct number of slots', () => {
        const rooms = [makeRoom(1, 'R1', 3, 4)]; // 12 benches
        const slots = buildSeatSlots(rooms, 'SINGLE');
        expect(slots).toHaveLength(12);
    });

    test('slots ordered row-by-row, col-by-col', () => {
        const rooms = [makeRoom(1, 'R1', 2, 3)];
        const slots = buildSeatSlots(rooms, 'SINGLE');
        // row 1: cols 1,2,3, then row 2: cols 1,2,3
        expect(slots[0]).toMatchObject({ row: 1, col: 1 });
        expect(slots[1]).toMatchObject({ row: 1, col: 2 });
        expect(slots[2]).toMatchObject({ row: 1, col: 3 });
        expect(slots[3]).toMatchObject({ row: 2, col: 1 });
    });

    test('multiple rooms ordered by room_code', () => {
        const rooms = [
            makeRoom(2, 'Z-Room', 1, 1),
            makeRoom(1, 'A-Room', 1, 1),
        ];
        const slots = buildSeatSlots(rooms, 'SINGLE');
        expect(slots[0].roomId).toBe(1); // A-Room first
        expect(slots[1].roomId).toBe(2); // Z-Room second
    });

    test('empty rooms → empty slots', () => {
        const slots = buildSeatSlots([], 'SINGLE');
        expect(slots).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  6. GROUPING UTILITIES
// ═══════════════════════════════════════════════════════════════

describe('groupBySubject', () => {
    test('groups students correctly', () => {
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '102', 'CSE', 'DS'),
            makeStudent(3, '201', 'CSIT', 'SPM'),
        ];
        const groups = groupBySubject(students);
        expect(Object.keys(groups)).toHaveLength(2);
        expect(groups['DS']).toHaveLength(2);
        expect(groups['SPM']).toHaveLength(1);
    });

    test('sorts each group by roll number', () => {
        const students = [
            makeStudent(2, '103', 'CSE', 'DS'),
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(3, '102', 'CSE', 'DS'),
        ];
        const groups = groupBySubject(students);
        expect(groups['DS'][0].roll_number).toBe('101');
        expect(groups['DS'][1].roll_number).toBe('102');
        expect(groups['DS'][2].roll_number).toBe('103');
    });

    test('handles hyphenated roll numbers (no in-group sort)', () => {
        const students = [
            makeStudent(1, '2451-23-733-003', 'CSE', 'DS'),
            makeStudent(2, '2451-23-733-001', 'CSE', 'DS'),
            makeStudent(3, '2451-23-733-002', 'CSE', 'DS'),
        ];
        const groups = groupBySubject(students);
        // groupBySubject preserves insertion order (no internal sort)
        expect(groups['DS']).toHaveLength(3);
        expect(groups['DS'].map(s => s.roll_number)).toEqual(
            expect.arrayContaining(['2451-23-733-001', '2451-23-733-002', '2451-23-733-003'])
        );
    });

    test('empty students → empty groups', () => {
        const groups = groupBySubject([]);
        expect(Object.keys(groups)).toHaveLength(0);
    });
});

describe('groupByBranch', () => {
    test('groups by branch code', () => {
        const students = [
            makeStudent(1, '101', 'CSE', 'DS'),
            makeStudent(2, '201', 'CSIT', 'SPM'),
            makeStudent(3, '102', 'CSE', 'MATH'),
        ];
        const groups = groupByBranch(students);
        expect(Object.keys(groups)).toHaveLength(2);
        expect(groups['CSE']).toHaveLength(2);
        expect(groups['CSIT']).toHaveLength(1);
    });

    test('groups by branch+section when section exists', () => {
        const students = [
            { ...makeStudent(1, '101', 'CSE', 'DS'), branch_section: 'A' },
            { ...makeStudent(2, '102', 'CSE', 'DS'), branch_section: 'B' },
            { ...makeStudent(3, '103', 'CSE', 'DS'), branch_section: 'A' },
            { ...makeStudent(4, '201', 'CSIT', 'SPM') },
        ];
        const groups = groupByBranch(students);
        expect(Object.keys(groups)).toHaveLength(3);
        expect(groups['CSE-A']).toHaveLength(2);
        expect(groups['CSE-B']).toHaveLength(1);
        expect(groups['CSIT']).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════════════════
//  7. PAIRING ALGORITHM — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('buildDifferentSubjectPairs — Edge Cases', () => {
    test('two subjects, equal count → all paired', () => {
        const groups = {
            'DS': [makeStudent(1, '1', 'A', 'DS'), makeStudent(2, '2', 'A', 'DS')],
            'SPM': [makeStudent(3, '3', 'B', 'SPM'), makeStudent(4, '4', 'B', 'SPM')]
        };
        const { pairs, solos } = buildDifferentSubjectPairs(groups);
        expect(pairs).toHaveLength(2);
        expect(solos).toHaveLength(0);
    });

    test('two subjects, imbalanced → solos from larger group', () => {
        const groups = {
            'DS': Array.from({ length: 10 }, (_, i) => makeStudent(i + 1, String(i + 1), 'A', 'DS')),
            'SPM': [makeStudent(11, '11', 'B', 'SPM')]
        };
        const { pairs, solos } = buildDifferentSubjectPairs(groups);
        expect(pairs).toHaveLength(1);
        expect(solos).toHaveLength(9);
    });

    test('empty groups → no pairs, no solos', () => {
        const { pairs, solos } = buildDifferentSubjectPairs({});
        expect(pairs).toHaveLength(0);
        expect(solos).toHaveLength(0);
    });

    test('5 subjects with 1 student each → 2 pairs + 1 solo', () => {
        const groups = {};
        ['DS', 'SPM', 'MATH', 'OS', 'CN'].forEach((subj, i) => {
            groups[subj] = [makeStudent(i + 1, String(i + 1), 'A', subj)];
        });
        const { pairs, solos } = buildDifferentSubjectPairs(groups);
        expect(pairs).toHaveLength(2);
        expect(solos).toHaveLength(1);
    });

    test('all pairs have different subjects (large)', () => {
        const groups = {
            'DS': Array.from({ length: 100 }, (_, i) => makeStudent(i + 1, String(i + 1), 'A', 'DS')),
            'SPM': Array.from({ length: 80 }, (_, i) => makeStudent(i + 101, String(i + 101), 'B', 'SPM')),
            'MATH': Array.from({ length: 40 }, (_, i) => makeStudent(i + 201, String(i + 201), 'C', 'MATH')),
        };
        const { pairs } = buildDifferentSubjectPairs(groups);
        pairs.forEach(p => {
            expect(p.a.subject_name).not.toBe(p.b.subject_name);
        });
        // Should have 110 pairs (80+40=120 paired with 100, but constrained by totals)
        expect(pairs.length).toBe(110);
    });
});

// ═══════════════════════════════════════════════════════════════
//  8. ROUND-ROBIN INTERLEAVE — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('roundRobinInterleave — Edge Cases', () => {
    test('returns all students', () => {
        const groups = {
            'DS': Array.from({ length: 5 }, (_, i) => makeStudent(i + 1, String(i + 1), 'A', 'DS')),
            'SPM': Array.from({ length: 3 }, (_, i) => makeStudent(i + 6, String(i + 6), 'B', 'SPM')),
        };
        const result = roundRobinInterleave(groups);
        expect(result).toHaveLength(8);
    });

    test('single subject → no interleaving needed', () => {
        const groups = {
            'DS': [makeStudent(1, '1', 'A', 'DS'), makeStudent(2, '2', 'A', 'DS')]
        };
        const result = roundRobinInterleave(groups);
        expect(result).toHaveLength(2);
    });

    test('empty → empty', () => {
        const result = roundRobinInterleave({});
        expect(result).toHaveLength(0);
    });

    test('maximises subject dispersion', () => {
        const groups = {
            'DS': Array.from({ length: 3 }, (_, i) => makeStudent(i + 1, String(i + 1), 'A', 'DS')),
            'SPM': Array.from({ length: 3 }, (_, i) => makeStudent(i + 4, String(i + 4), 'B', 'SPM')),
            'MATH': Array.from({ length: 3 }, (_, i) => makeStudent(i + 7, String(i + 7), 'C', 'MATH')),
        };
        const result = roundRobinInterleave(groups);
        // First 3 should all be different subjects
        const firstThreeSubjects = new Set(result.slice(0, 3).map(s => s.subject_name));
        expect(firstThreeSubjects.size).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════════════
//  9. VALIDATOR — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Validator — Edge Cases', () => {
    test('detects duplicate seat assignment', () => {
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' },
            { studentId: 2, rollNumber: '102', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'SPM' },
        ];
        const students = [makeStudent(1, '101', 'CSE', 'DS'), makeStudent(2, '102', 'CSIT', 'SPM')];
        const report = { totalStudents: 2, assignedCount: 2, unassignedCount: 0 };
        const rooms = [makeRoom(1, 'R1', 2, 2)];

        const result = validateAllocation({ allocations, students, report, mode: 'SINGLE', rooms });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('DUPLICATE_SEAT'))).toBe(true);
    });

    test('warns on low utilization', () => {
        const rooms = [makeRoom(1, 'R1', 10, 10)]; // 100 seats
        const students = [makeStudent(1, '101', 'CSE', 'DS')];
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' }
        ];
        const report = { totalStudents: 1, assignedCount: 1, unassignedCount: 0 };

        const result = validateAllocation({ allocations, students, report, mode: 'SINGLE', rooms });
        expect(result.warnings.some(w => w.includes('utilization'))).toBe(true);
    });

    test('detects completeness error', () => {
        const allocations = [];
        const students = [makeStudent(1, '101', 'CSE', 'DS')];
        const report = { totalStudents: 1, assignedCount: 0, unassignedCount: 0 }; // neither assigned nor unassigned
        const rooms = [makeRoom(1, 'R1', 2, 2)];

        const result = validateAllocation({ allocations, students, report, mode: 'SINGLE', rooms });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('COMPLETENESS'))).toBe(true);
    });

    test('passes valid empty allocation', () => {
        const result = validateAllocation({
            allocations: [], students: [],
            report: { totalStudents: 0, assignedCount: 0, unassignedCount: 0 },
            mode: 'SINGLE', rooms: [makeRoom(1, 'R1', 2, 2)]
        });
        expect(result.valid).toBe(true);
    });

    test('LINEAR DOUBLE same-subject pair is now an error', () => {
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' },
            { studentId: 2, rollNumber: '102', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'B', subjectName: 'DS' },
        ];
        const students = [makeStudent(1, '101', 'CSE', 'DS'), makeStudent(2, '102', 'CSE', 'DS')];
        const report = { totalStudents: 2, assignedCount: 2, unassignedCount: 0 };
        const rooms = [makeRoom(1, 'R1', 2, 2)];

        const result = validateAllocation({
            allocations, students, report, mode: 'DOUBLE', rooms,
            allocationMethod: 'LINEAR'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('SAME_SUBJECT_PAIR'))).toBe(true);
    });

    test('over capacity detected', () => {
        const rooms = [makeRoom(1, 'R1', 1, 1)]; // 1 seat
        const allocations = [
            { studentId: 1, rollNumber: '101', roomId: 1, rowNumber: 1, columnNumber: 1, seatPosition: 'A', subjectName: 'DS' },
            { studentId: 2, rollNumber: '102', roomId: 1, rowNumber: 1, columnNumber: 2, seatPosition: 'A', subjectName: 'DS' },
        ];
        const report = { totalStudents: 2, assignedCount: 2, unassignedCount: 0 };
        const students = [makeStudent(1, '101', 'CSE', 'DS'), makeStudent(2, '102', 'CSE', 'DS')];

        const result = validateAllocation({ allocations, students, report, mode: 'SINGLE', rooms });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('OVER_CAPACITY'))).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
//  10. END-TO-END ALLOCATION + VALIDATION
// ═══════════════════════════════════════════════════════════════

describe('End-to-End: Allocate then Validate', () => {
    test('SINGLE INTERLEAVED — passes validation', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)];
        const students = [
            ...Array.from({ length: 10 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 8 }, (_, i) => makeStudent(i + 11, 200 + i, 'CSIT', 'SPM')),
        ];
        const result = allocateSeats({ rooms, students, mode: 'SINGLE', allocationMethod: 'INTERLEAVED' });
        const validation = validateAllocation({
            allocations: result.allocations, students, report: result.report,
            mode: 'SINGLE', rooms, allocationMethod: 'INTERLEAVED'
        });
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
    });

    test('DOUBLE INTERLEAVED — passes validation', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)];
        const students = [
            ...Array.from({ length: 10 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 10 }, (_, i) => makeStudent(i + 11, 200 + i, 'CSIT', 'SPM')),
        ];
        const result = allocateSeats({ rooms, students, mode: 'DOUBLE', allocationMethod: 'INTERLEAVED' });
        const validation = validateAllocation({
            allocations: result.allocations, students, report: result.report,
            mode: 'DOUBLE', rooms, allocationMethod: 'INTERLEAVED'
        });
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
    });

    test('LINEAR SINGLE — passes validation', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5), makeRoom(2, 'R2', 3, 3)];
        const students = [
            ...Array.from({ length: 15 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 10 }, (_, i) => makeStudent(i + 16, 200 + i, 'CSIT', 'SPM')),
        ];
        const result = allocateSeats({ rooms, students, mode: 'SINGLE', allocationMethod: 'LINEAR' });
        const validation = validateAllocation({
            allocations: result.allocations, students, report: result.report,
            mode: 'SINGLE', rooms, allocationMethod: 'LINEAR'
        });
        expect(validation.valid).toBe(true);
    });

    test('LINEAR DOUBLE — passes validation', () => {
        const rooms = [makeRoom(1, 'R1', 5, 5)];
        const students = [
            ...Array.from({ length: 12 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 8 }, (_, i) => makeStudent(i + 13, 200 + i, 'CSIT', 'SPM')),
        ];
        const result = allocateSeats({ rooms, students, mode: 'DOUBLE', allocationMethod: 'LINEAR' });
        const validation = validateAllocation({
            allocations: result.allocations, students, report: result.report,
            mode: 'DOUBLE', rooms, allocationMethod: 'LINEAR'
        });
        expect(validation.valid).toBe(true);
    });

    test('DETERMINISM: same inputs always produce same output', () => {
        const rooms = [makeRoom(1, 'R1', 3, 3)];
        const students = [
            ...Array.from({ length: 4 }, (_, i) => makeStudent(i + 1, 100 + i, 'CSE', 'DS')),
            ...Array.from({ length: 3 }, (_, i) => makeStudent(i + 5, 200 + i, 'CSIT', 'SPM')),
        ];

        const result1 = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        const result2 = allocateSeats({ rooms, students, mode: 'DOUBLE' });

        expect(result1.allocations).toEqual(result2.allocations);
        expect(result1.report).toEqual(result2.report);
    });

    test('large-scale: 500 students across 5 rooms', () => {
        const rooms = [
            makeRoom(1, 'A1', 10, 10),
            makeRoom(2, 'A2', 10, 10),
            makeRoom(3, 'B1', 10, 10),
            makeRoom(4, 'B2', 10, 10),
            makeRoom(5, 'C1', 10, 10),
        ]; // 500 benches total
        const students = [
            ...Array.from({ length: 200 }, (_, i) => makeStudent(i + 1, 1000 + i, 'CSE', 'DS')),
            ...Array.from({ length: 150 }, (_, i) => makeStudent(i + 201, 2000 + i, 'CSIT', 'SPM')),
            ...Array.from({ length: 100 }, (_, i) => makeStudent(i + 351, 3000 + i, 'CIC', 'MATH')),
            ...Array.from({ length: 50 }, (_, i) => makeStudent(i + 451, 4000 + i, 'CSD', 'OS')),
        ];

        const result = allocateSeats({ rooms, students, mode: 'SINGLE' });
        expect(result.report.assignedCount).toBe(500);
        expect(result.report.unassignedCount).toBe(0);

        const validation = validateAllocation({
            allocations: result.allocations, students, report: result.report,
            mode: 'SINGLE', rooms
        });
        expect(validation.valid).toBe(true);
    });

    test('large-scale DOUBLE: 400 students, 4 subjects', () => {
        const rooms = [
            makeRoom(1, 'R1', 10, 10),
            makeRoom(2, 'R2', 10, 10),
        ]; // 200 benches = 400 seats
        const students = [
            ...Array.from({ length: 100 }, (_, i) => makeStudent(i + 1, 1000 + i, 'CSE', 'DS')),
            ...Array.from({ length: 100 }, (_, i) => makeStudent(i + 101, 2000 + i, 'CSIT', 'SPM')),
            ...Array.from({ length: 100 }, (_, i) => makeStudent(i + 201, 3000 + i, 'CIC', 'MATH')),
            ...Array.from({ length: 100 }, (_, i) => makeStudent(i + 301, 4000 + i, 'CSD', 'OS')),
        ];

        const result = allocateSeats({ rooms, students, mode: 'DOUBLE' });
        expect(result.report.assignedCount).toBe(400);

        const validation = validateAllocation({
            allocations: result.allocations, students, report: result.report,
            mode: 'DOUBLE', rooms
        });
        expect(validation.valid).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
//  ELECTIVE ORDERING BY SUBJECT CODE — TESTS
// ═══════════════════════════════════════════════════════════════

describe('Elective Ordering by Subject Code', () => {
    // Helper to create student with subject_code
    function makeStudentWithCode(id, roll, branch, subjectName, subjectCode, section = '') {
        return {
            id,
            roll_number: String(roll),
            branch_code: branch,
            branch_section: section,
            subject_name: subjectName,
            subject_code: subjectCode,
            branch_id: 1,
            subject_id: 1
        };
    }

    test('LINEAR SINGLE orders electives by subject_code within same branch', () => {
        const rooms = [{ id: 1, room_code: 'R1', rows: 10, columns: 1 }];

        // Create students with different electives (out of order)
        const students = [
            makeStudentWithCode(1, 101, 'CSE', 'OE-II Elective', 'OE-II', ''),
            makeStudentWithCode(2, 102, 'CSE', 'PE-II Elective', 'PE-II', ''),
            makeStudentWithCode(3, 103, 'CSE', 'PE-I Elective', 'PE-I', ''),
            makeStudentWithCode(4, 104, 'CSE', 'OE-I Elective', 'OE-I', ''),
        ];

        const { allocations } = allocateSeats({
            rooms,
            students,
            mode: 'SINGLE',
            allocationMethod: 'LINEAR'
        });

        // Should be ordered: OE-I, OE-II, PE-I, PE-II (alphabetical by subject_code)
        const subjectOrder = allocations.map(a => a.subjectName);
        expect(subjectOrder[0]).toBe('OE-I Elective');
        expect(subjectOrder[1]).toBe('OE-II Elective');
        expect(subjectOrder[2]).toBe('PE-I Elective');
        expect(subjectOrder[3]).toBe('PE-II Elective');
    });

    test('LINEAR DOUBLE orders electives by subject_code and pairs correctly', () => {
        const rooms = [{ id: 1, room_code: 'R1', rows: 5, columns: 2 }]; // 20 seats

        // Create students from different branches with different electives
        const students = [
            // CSE students with PE-II and PE-I (out of order)
            makeStudentWithCode(1, 101, 'CSE', 'PE-II', 'PE-II', 'A'),
            makeStudentWithCode(2, 102, 'CSE', 'PE-II', 'PE-II', 'A'),
            makeStudentWithCode(3, 103, 'CSE', 'PE-I', 'PE-I', 'A'),
            makeStudentWithCode(4, 104, 'CSE', 'PE-I', 'PE-I', 'A'),
            // IT students with different electives
            makeStudentWithCode(5, 201, 'IT', 'OE-I', 'OE-I', ''),
            makeStudentWithCode(6, 202, 'IT', 'OE-I', 'OE-I', ''),
        ];

        const { allocations } = allocateSeats({
            rooms,
            students,
            mode: 'DOUBLE',
            allocationMethod: 'LINEAR'
        });

        expect(allocations.length).toBe(6);

        // Check that different subjects are paired on the same bench
        const benches = {};
        allocations.forEach(a => {
            const key = `${a.roomId}-${a.rowNumber}-${a.columnNumber}`;
            if (!benches[key]) benches[key] = [];
            benches[key].push(a.subjectName);
        });

        // Each bench with 2 students should have different subjects
        Object.values(benches).forEach(subjects => {
            if (subjects.length === 2) {
                expect(subjects[0]).not.toBe(subjects[1]);
            }
        });
    });

    test('LINEAR mode groups students by branch then by subject_code', () => {
        const rooms = [{ id: 1, room_code: 'R1', rows: 10, columns: 1 }];

        const students = [
            // IT students (should come after CSE alphabetically)
            makeStudentWithCode(5, 201, 'IT', 'Data Science', 'DS-101', ''),
            // CSE-B students
            makeStudentWithCode(3, 121, 'CSE', 'ML', 'ML-101', 'B'),
            // CSE-A students
            makeStudentWithCode(1, 101, 'CSE', 'Networks', 'NET-101', 'A'),
            makeStudentWithCode(2, 102, 'CSE', 'AI', 'AI-101', 'A'),
            makeStudentWithCode(4, 111, 'CSE', 'AI', 'AI-101', 'A'),
        ];

        const { allocations } = allocateSeats({
            rooms,
            students: students.slice().reverse(), // Reverse to test ordering
            mode: 'SINGLE',
            allocationMethod: 'LINEAR'
        });

        // CSE-A should come before CSE-B, and both before IT
        const branches = allocations.map(a => `${a.branchCode}${a.branchSection ? '-' + a.branchSection : ''}`);

        // Find indices
        const cseAIndices = branches.map((b, i) => b.startsWith('CSE-A') ? i : -1).filter(i => i >= 0);
        const cseBIndices = branches.map((b, i) => b.startsWith('CSE-B') ? i : -1).filter(i => i >= 0);
        const itIndices = branches.map((b, i) => b === 'IT' ? i : -1).filter(i => i >= 0);

        // All CSE-A before any CSE-B
        if (cseAIndices.length && cseBIndices.length) {
            expect(Math.max(...cseAIndices)).toBeLessThan(Math.min(...cseBIndices));
        }
        // All CSE before IT
        const allCseIndices = [...cseAIndices, ...cseBIndices];
        if (allCseIndices.length && itIndices.length) {
            expect(Math.max(...allCseIndices)).toBeLessThan(Math.min(...itIndices));
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  EFFECTIVE CAPACITY — TESTS
// ═══════════════════════════════════════════════════════════════

describe('Effective Capacity', () => {
    const RoomModel = require('../server/models/Room');

    test('getSeatCount returns effective_capacity when set', () => {
        const room = {
            id: 1,
            rows: 10,
            columns: 6,
            total_capacity: 60,
            effective_capacity: 30
        };

        // SINGLE mode
        expect(RoomModel.getSeatCount(room, 'SINGLE')).toBe(30);

        // DOUBLE mode - effective capacity is per-bench count
        expect(RoomModel.getSeatCount(room, 'DOUBLE')).toBe(60);
    });

    test('getSeatCount returns total_capacity when effective_capacity is null', () => {
        const room = {
            id: 1,
            rows: 10,
            columns: 6,
            total_capacity: 60,
            effective_capacity: null
        };

        expect(RoomModel.getSeatCount(room, 'SINGLE')).toBe(60);
        expect(RoomModel.getSeatCount(room, 'DOUBLE')).toBe(120);
    });

    test('getSeatCount handles undefined effective_capacity', () => {
        const room = {
            id: 1,
            rows: 10,
            columns: 6,
            total_capacity: 60
            // effective_capacity not set
        };

        expect(RoomModel.getSeatCount(room, 'SINGLE')).toBe(60);
    });

    test('allocation respects effective_capacity limit in SINGLE mode', () => {
        // Room has 6 benches (2x3) but effective_capacity is 4
        const rooms = [{
            id: 1,
            room_code: 'R1',
            rows: 2,
            columns: 3,
            effective_capacity: 4
        }];

        // 6 students but only 4 seats available due to effective_capacity
        const students = [];
        for (let i = 1; i <= 6; i++) {
            students.push({
                id: i,
                roll_number: String(100 + i),
                branch_code: 'CSE',
                subject_name: 'DS',
                branch_id: 1,
                subject_id: 1
            });
        }

        const { allocations, report } = allocateSeats({
            rooms,
            students,
            mode: 'SINGLE',
            allocationMethod: 'INTERLEAVED'
        });

        // Only 4 students should be allocated (not 6)
        expect(report.assignedCount).toBe(4);
        expect(report.unassignedCount).toBe(2);
        expect(report.totalSeats).toBe(4);
        expect(allocations).toHaveLength(4);
    });

    test('allocation respects effective_capacity limit in DOUBLE mode', () => {
        // Room has 6 benches (2x3) but effective_capacity is 3
        // In DOUBLE mode, 3 benches = 6 seats
        const rooms = [{
            id: 1,
            room_code: 'R1',
            rows: 2,
            columns: 3,
            effective_capacity: 3
        }];

        // 8 students with 2 different subjects
        const students = [];
        for (let i = 1; i <= 4; i++) {
            students.push({
                id: i,
                roll_number: String(100 + i),
                branch_code: 'CSE',
                subject_name: 'DS',
                branch_id: 1,
                subject_id: 1
            });
        }
        for (let i = 5; i <= 8; i++) {
            students.push({
                id: i,
                roll_number: String(100 + i),
                branch_code: 'IT',
                subject_name: 'OS',
                branch_id: 2,
                subject_id: 2
            });
        }

        const { allocations, report } = allocateSeats({
            rooms,
            students,
            mode: 'DOUBLE',
            allocationMethod: 'INTERLEAVED'
        });

        // Only 6 students should be allocated (3 benches * 2 seats)
        expect(report.assignedCount).toBe(6);
        expect(report.unassignedCount).toBe(2);
        expect(report.totalSeats).toBe(6);
    });

    test('allocation without effective_capacity uses full capacity', () => {
        // Room has 6 benches (2x3), no effective_capacity set
        const rooms = [{
            id: 1,
            room_code: 'R1',
            rows: 2,
            columns: 3
            // No effective_capacity
        }];

        const students = [];
        for (let i = 1; i <= 6; i++) {
            students.push({
                id: i,
                roll_number: String(100 + i),
                branch_code: 'CSE',
                subject_name: 'DS',
                branch_id: 1,
                subject_id: 1
            });
        }

        const { allocations, report } = allocateSeats({
            rooms,
            students,
            mode: 'SINGLE',
            allocationMethod: 'INTERLEAVED'
        });

        // All 6 students should be allocated
        expect(report.assignedCount).toBe(6);
        expect(report.unassignedCount).toBe(0);
        expect(report.totalSeats).toBe(6);
    });
});
