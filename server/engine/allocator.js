/**
 * ============================================================
 *  SEAT ALLOCATION ENGINE
 * ============================================================
 *
 *  The core algorithm that assigns students to seats while
 *  respecting all seating rules. Supports both SINGLE and
 *  DOUBLE bench modes with deterministic output.
 *
 *  ── ALGORITHM OVERVIEW ──────────────────────────────────────
 *
 *  SINGLE MODE
 *  -----------
 *  1. Collect all students, group them by subject.
 *  2. Interleave students from different subjects into a single
 *     ordered queue using a round-robin strategy across subjects
 *     (sorted by count descending to maximize spacing).
 *  3. Walk through rooms in order; within each room walk
 *     row-by-row, column-by-column, placing one student per
 *     bench from the interleaved queue.
 *  4. The round-robin interleaving guarantees that consecutive
 *     seats are unlikely to share the same subject, achieving
 *     even distribution without clustering.
 *
 *  DOUBLE MODE
 *  -----------
 *  1. Group students by subject.
 *  2. Build (A, B) pairs where A and B have DIFFERENT subjects.
 *     Strategy: sort subject groups by count descending.
 *     Pop one student from the largest group for seat A, then
 *     pop one from the next-largest group (different subject)
 *     for seat B. Re-sort after each pair.
 *  3. If a subject has remaining students that cannot be paired
 *     (all other subjects are exhausted), those students are
 *     seated alone (seat A filled, seat B empty) or reported
 *     as unassignable if seats run out.
 *  4. Place pairs into room benches sequentially.
 *
 *  DETERMINISM
 *  -----------
 *  The same inputs always produce the same output because:
 *  - Students within each subject are sorted by roll number.
 *  - Subject groups are processed in a deterministic order
 *    (descending count, then alphabetical subject name).
 *  - Rooms are processed by room_code alphabetical order.
 *  - No randomness is used anywhere.
 *
 *  EDGE CASES
 *  ----------
 *  - More students than seats → unassigned list with reason.
 *  - Only one subject in DOUBLE mode → students sit alone
 *    (seat B empty); the constraint "different subjects" is
 *    trivially satisfied since no pairing occurs.
 *  - Zero students or zero rooms → empty result + report.
 *  - Odd total in DOUBLE mode → last student sits alone.
 *
 * ============================================================
 */

/**
 * Main entry point. Allocates students to seats.
 *
 * @param {Object} params
 * @param {Array}  params.rooms      - Rooms in use, sorted by room_code
 *        Each: { id, room_code, rows, columns }
 * @param {Array}  params.students   - All students for this session
 *        Each: { id, roll_number, branch_code, subject_name, branch_id, subject_id }
 * @param {string} params.mode       - 'SINGLE' | 'DOUBLE'
 * @param {string} [params.allocationMethod='INTERLEAVED'] - 'INTERLEAVED' | 'LINEAR'
 *
 * @returns {{ allocations: Array, report: Object }}
 */
function allocateSeats({ rooms, students, mode, allocationMethod = 'INTERLEAVED' }) {
    // Auto-switch: if DOUBLE mode but every student has the same subject,
    // pairing is impossible — fall back to SINGLE to avoid wasting bench capacity.
    if (mode === 'DOUBLE' && students.length > 0) {
        const subjects = new Set(students.map(s => s.subject_name));
        if (subjects.size === 1) {
            const fallbackMode = 'SINGLE';
            const result = allocationMethod === 'LINEAR'
                ? allocateLinearSingle(rooms, students)
                : allocateSingle(rooms, students);
            result.report.modeAutoSwitched = true;
            result.report.modeAutoSwitchedReason =
                `All students share the same subject ("${[...subjects][0]}"). ` +
                `Switched from DOUBLE to SINGLE mode automatically.`;
            return result;
        }
    }

    if (allocationMethod === 'LINEAR') {
        if (mode === 'DOUBLE') {
            return allocateLinearDouble(rooms, students);
        }
        return allocateLinearSingle(rooms, students);
    }
    if (mode === 'DOUBLE') {
        return allocateDouble(rooms, students);
    }
    return allocateSingle(rooms, students);
}

// ═══════════════════════════════════════════════════════════════
//  SINGLE MODE ALLOCATION
// ═══════════════════════════════════════════════════════════════

function allocateSingle(rooms, students) {
    // 1. Total available seats (1 per bench)
    const totalSeats = rooms.reduce((sum, r) => sum + r.rows * r.columns, 0);

    // 2. Group students by subject, sort each group by roll number
    const subjectGroups = groupBySubject(students);

    // 3. Interleave via round-robin for maximum subject dispersion
    const queue = roundRobinInterleave(subjectGroups);

    // 4. Build seat list (all benches across all rooms, in order)
    const seatSlots = buildSeatSlots(rooms, 'SINGLE');

    // 5. Assign students to seats
    const allocations = [];
    const assigned = new Set();
    let qi = 0;

    for (const slot of seatSlots) {
        if (qi >= queue.length) break; // no more students
        const student = queue[qi++];
        assigned.add(student.id);
        allocations.push({
            roomId: slot.roomId,
            rowNumber: slot.row,
            columnNumber: slot.col,
            seatPosition: 'A',
            studentId: student.id,
            rollNumber: student.roll_number,
            branchCode: student.branch_code,
            subjectName: student.subject_name
        });
    }

    // 6. Identify unassigned students
    const unassigned = queue.slice(qi);
    const unassignedReasons = unassigned.map(s => ({
        rollNumber: s.roll_number,
        branchCode: s.branch_code,
        reason: 'INSUFFICIENT_CAPACITY'
    }));

    return {
        allocations,
        report: {
            totalStudents: students.length,
            totalSeats,
            assignedCount: assigned.size,
            unassignedCount: unassigned.length,
            unassignedReasons
        }
    };
}

// ═══════════════════════════════════════════════════════════════
//  DOUBLE MODE ALLOCATION
// ═══════════════════════════════════════════════════════════════

function allocateDouble(rooms, students) {
    // 1. Total available seats (2 per bench)
    const totalSeats = rooms.reduce((sum, r) => sum + r.rows * r.columns * 2, 0);

    // 2. Group students by subject
    const subjectGroups = groupBySubject(students);
    const subjectNames = Object.keys(subjectGroups);

    // 3. Build pairs: (seatA, seatB) with DIFFERENT subjects
    const { pairs, solos, unpaired } = buildDifferentSubjectPairs(subjectGroups);

    // 4. Build seat slots (each slot = one bench with A+B)
    const benchSlots = buildSeatSlots(rooms, 'DOUBLE');

    // 5. Assign pairs to benches
    const allocations = [];
    const assigned = new Set();
    let bi = 0; // bench index

    // First assign all pairs
    for (const pair of pairs) {
        if (bi >= benchSlots.length) break;
        const slot = benchSlots[bi++];

        assigned.add(pair.a.id);
        assigned.add(pair.b.id);

        allocations.push({
            roomId: slot.roomId,
            rowNumber: slot.row,
            columnNumber: slot.col,
            seatPosition: 'A',
            studentId: pair.a.id,
            rollNumber: pair.a.roll_number,
            branchCode: pair.a.branch_code,
            subjectName: pair.a.subject_name
        });
        allocations.push({
            roomId: slot.roomId,
            rowNumber: slot.row,
            columnNumber: slot.col,
            seatPosition: 'B',
            studentId: pair.b.id,
            rollNumber: pair.b.roll_number,
            branchCode: pair.b.branch_code,
            subjectName: pair.b.subject_name
        });
    }

    // Then assign solos (students who couldn't be paired differently)
    for (const solo of solos) {
        if (bi >= benchSlots.length) break;
        const slot = benchSlots[bi++];
        assigned.add(solo.id);
        allocations.push({
            roomId: slot.roomId,
            rowNumber: slot.row,
            columnNumber: slot.col,
            seatPosition: 'A',
            studentId: solo.id,
            rollNumber: solo.roll_number,
            branchCode: solo.branch_code,
            subjectName: solo.subject_name
        });
        // Seat B is intentionally left empty
    }

    // 6. Build unassigned list
    const allAssignedIds = assigned;
    const unassignedStudents = [];

    // Students from the unpaired overflow
    for (const s of unpaired) {
        if (!allAssignedIds.has(s.id)) {
            unassignedStudents.push(s);
        }
    }

    // Pairs/solos that could not fit due to bench shortage
    for (const pair of pairs) {
        if (!allAssignedIds.has(pair.a.id)) unassignedStudents.push(pair.a);
        if (!allAssignedIds.has(pair.b.id)) unassignedStudents.push(pair.b);
    }
    for (const solo of solos) {
        if (!allAssignedIds.has(solo.id)) unassignedStudents.push(solo);
    }

    const unassignedReasons = unassignedStudents.map(s => ({
        rollNumber: s.roll_number,
        branchCode: s.branch_code,
        reason: 'INSUFFICIENT_CAPACITY'
    }));

    return {
        allocations,
        report: {
            totalStudents: students.length,
            totalSeats,
            assignedCount: assigned.size,
            unassignedCount: unassignedStudents.length,
            unassignedReasons
        }
    };
}

// ═══════════════════════════════════════════════════════════════
//  LINEAR SINGLE MODE ALLOCATION
// ═══════════════════════════════════════════════════════════════
//
//  Students are placed contiguously by branch/subject.
//  All students from branch A fill seats sequentially,
//  then branch B, etc. When a room fills, the remaining
//  students from that branch continue to the next room.
//  This mirrors real university seating where each branch
//  occupies a contiguous block of seats across rooms.
// ═══════════════════════════════════════════════════════════════

function allocateLinearSingle(rooms, students) {
    const totalSeats = rooms.reduce((sum, r) => sum + r.rows * r.columns, 0);

    // Group by branch, sort each group by roll number
    const branchGroups = groupByBranch(students);
    const branchOrder = Object.keys(branchGroups).sort();

    // Build a single linear queue: branch A students, then B, then C...
    const queue = [];
    for (const branch of branchOrder) {
        queue.push(...branchGroups[branch]);
    }

    // Build seat list across all rooms
    const seatSlots = buildSeatSlots(rooms, 'SINGLE');

    // Assign students to seats sequentially
    const allocations = [];
    const assigned = new Set();
    let qi = 0;

    for (const slot of seatSlots) {
        if (qi >= queue.length) break;
        const student = queue[qi++];
        assigned.add(student.id);
        allocations.push({
            roomId: slot.roomId,
            rowNumber: slot.row,
            columnNumber: slot.col,
            seatPosition: 'A',
            studentId: student.id,
            rollNumber: student.roll_number,
            branchCode: student.branch_code,
            subjectName: student.subject_name
        });
    }

    const unassigned = queue.slice(qi);
    const unassignedReasons = unassigned.map(s => ({
        rollNumber: s.roll_number,
        branchCode: s.branch_code,
        reason: 'INSUFFICIENT_CAPACITY'
    }));

    return {
        allocations,
        report: {
            totalStudents: students.length,
            totalSeats,
            assignedCount: assigned.size,
            unassignedCount: unassigned.length,
            unassignedReasons
        }
    };
}

// ═══════════════════════════════════════════════════════════════
//  LINEAR DOUBLE MODE ALLOCATION
// ═══════════════════════════════════════════════════════════════
//
//  Places students in CONTIGUOUS blocks by branch — NOT
//  interleaved.  Two branch pointers (pA for seat A, pB for
//  seat B) walk through the sorted branch list:
//
//    1. Seat A ← next student from the branch at pointer pA.
//    2. Seat B ← next student from the branch at pointer pB
//       (pB always points to a DIFFERENT branch AND a
//        DIFFERENT SUBJECT than pA).
//    3. When the pB branch is exhausted, pB advances to the
//       next non-empty branch with a different subject than pA.
//    4. When the pA branch is exhausted, pA advances forward.
//       pB is recalculated to find a branch with a different
//       subject than the new pA.
//    5. If no branch with a different subject remains, students
//       seat on A only — seat B stays empty.
//       This guarantees no same-subject pair shares a bench.
//
//  Result: large contiguous blocks of the same two branches,
//  exactly matching the university LINEAR seating layout.
// ═══════════════════════════════════════════════════════════════

function allocateLinearDouble(rooms, students) {
    const totalSeats = rooms.reduce((sum, r) => sum + r.rows * r.columns * 2, 0);

    // Group by branch+subject so that the same branch with different elective
    // subjects gets separate queues that can be paired together.
    const branchSubjectGroups = {};
    for (const s of students) {
        const key = `${s.branch_code}::${s.subject_name}`;
        if (!branchSubjectGroups[key]) branchSubjectGroups[key] = [];
        branchSubjectGroups[key].push(s);
    }
    for (const key of Object.keys(branchSubjectGroups)) {
        branchSubjectGroups[key].sort((a, b) => {
            const ra = parseInt(a.roll_number, 10);
            const rb = parseInt(b.roll_number, 10);
            if (!isNaN(ra) && !isNaN(rb)) return ra - rb;
            return String(a.roll_number).localeCompare(String(b.roll_number));
        });
    }
    const groupOrder = Object.keys(branchSubjectGroups).sort();

    // Build ordered queues, recording each group's subject
    const queues = groupOrder.map(key => {
        const grpStudents = [...branchSubjectGroups[key]];
        return {
            branch: key,
            subject: grpStudents[0] ? grpStudents[0].subject_name : '',
            students: grpStudents,
            idx: 0
        };
    });

    // Find the first non-exhausted queue at or after index `from`
    function findActive(from) {
        for (let i = from; i < queues.length; i++) {
            if (queues[i].idx < queues[i].students.length) return i;
        }
        return -1;
    }

    // Find active queue with a DIFFERENT subject than `skipSubject`,
    // starting from index `from` and skipping index `skipIdx`.
    function findActiveWithDiffSubject(from, skipIdx, skipSubject) {
        for (let i = from; i < queues.length; i++) {
            if (i === skipIdx) continue;
            if (queues[i].idx < queues[i].students.length && queues[i].subject !== skipSubject) {
                return i;
            }
        }
        return -1;
    }

    // Build bench slots across all rooms
    const benchSlots = buildSeatSlots(rooms, 'DOUBLE');

    const allocations = [];
    const assigned = new Set();

    // Two branch pointers — always different branches AND different subjects
    let pA = findActive(0);
    let pB = pA >= 0 ? findActiveWithDiffSubject(0, pA, queues[pA].subject) : -1;

    for (const slot of benchSlots) {
        if (pA < 0) break; // all students placed

        // ── Seat A: from branch at pA ──────────────────────────
        const qA = queues[pA];
        const studentA = qA.students[qA.idx++];
        assigned.add(studentA.id);
        allocations.push({
            roomId: slot.roomId,
            rowNumber: slot.row,
            columnNumber: slot.col,
            seatPosition: 'A',
            studentId: studentA.id,
            rollNumber: studentA.roll_number,
            branchCode: studentA.branch_code,
            subjectName: studentA.subject_name
        });

        // ── Seat B: from branch at pB (different branch + different subject) ──
        if (pB >= 0 && queues[pB].idx < queues[pB].students.length) {
            const qB = queues[pB];
            const studentB = qB.students[qB.idx++];
            assigned.add(studentB.id);
            allocations.push({
                roomId: slot.roomId,
                rowNumber: slot.row,
                columnNumber: slot.col,
                seatPosition: 'B',
                studentId: studentB.id,
                rollNumber: studentB.roll_number,
                branchCode: studentB.branch_code,
                subjectName: studentB.subject_name
            });

            // If B branch exhausted, find next active with different subject
            if (qB.idx >= qB.students.length) {
                pB = findActiveWithDiffSubject(0, pA, queues[pA].subject);
            }
        }

        // If A branch exhausted, advance pA and recalculate pB
        if (qA.idx >= qA.students.length) {
            pA = findActive(pA + 1);
            if (pA >= 0) {
                pB = findActiveWithDiffSubject(0, pA, queues[pA].subject);
            } else {
                pB = -1;
            }
        }
    }

    // Identify unassigned students
    const unassignedStudents = students.filter(s => !assigned.has(s.id));
    const unassignedReasons = unassignedStudents.map(s => ({
        rollNumber: s.roll_number,
        branchCode: s.branch_code,
        reason: 'INSUFFICIENT_CAPACITY'
    }));

    return {
        allocations,
        report: {
            totalStudents: students.length,
            totalSeats,
            assignedCount: assigned.size,
            unassignedCount: unassignedStudents.length,
            unassignedReasons
        }
    };
}

// ═══════════════════════════════════════════════════════════════
//  PAIRING ALGORITHM  (DOUBLE MODE)
// ═══════════════════════════════════════════════════════════════

/**
 * Builds pairs of students with DIFFERENT subjects.
 *
 * Strategy:
 *   - Maintain a priority list of subject queues (largest first).
 *   - Pop one student from queue[0] → seat A.
 *   - Pop one student from queue[1] (different subject) → seat B.
 *   - Re-sort the queues by remaining count.
 *   - Repeat until pairing is impossible.
 *
 * This greedy approach maximises the number of valid pairs.
 * It is optimal when there are ≥2 subjects because we always
 * pair the two largest groups, preventing one group from
 * becoming disproportionately large and blocking future pairs.
 *
 * Proof sketch: at every step we pair the subject that has the
 * most remaining students with the subject that has the second-most.
 * This is equivalent to the classic "task interleaving" problem
 * and is known to be optimal for maximising pairs.
 *
 * @returns {{ pairs: Array<{a, b}>, solos: Array, unpaired: Array }}
 */
function buildDifferentSubjectPairs(subjectGroups) {
    // Each queue is { subject, students: [...] }, sorted by student count desc
    const queues = Object.entries(subjectGroups)
        .map(([subject, students]) => ({ subject, students: [...students] }))
        .sort((a, b) => b.students.length - a.students.length || a.subject.localeCompare(b.subject));

    const pairs = [];
    const solos = [];

    while (true) {
        // Remove empty queues
        const active = queues.filter(q => q.students.length > 0);
        if (active.length === 0) break;

        // Re-sort by remaining count (descending), then alphabetical
        active.sort((a, b) => b.students.length - a.students.length || a.subject.localeCompare(b.subject));

        if (active.length === 1) {
            // Only one subject remains — cannot pair differently
            // All remaining students become solos
            solos.push(...active[0].students.splice(0));
            break;
        }

        // Pop seat A from the largest group
        const studentA = active[0].students.shift();
        // Pop seat B from the second-largest group (guaranteed different subject)
        const studentB = active[1].students.shift();

        pairs.push({ a: studentA, b: studentB });
    }

    return { pairs, solos, unpaired: [] };
}

// ═══════════════════════════════════════════════════════════════
//  INTERLEAVING  (SINGLE MODE)
// ═══════════════════════════════════════════════════════════════

/**
 * Round-robin interleave students from different subjects.
 * Ensures maximum dispersion of same-subject students.
 *
 * Strategy: repeatedly pick one student from the subject with
 * the most remaining students, cycling through subjects.
 */
function roundRobinInterleave(subjectGroups) {
    const queues = Object.entries(subjectGroups)
        .map(([subject, students]) => ({ subject, students: [...students] }))
        .sort((a, b) => b.students.length - a.students.length || a.subject.localeCompare(b.subject));

    const result = [];

    while (true) {
        // Remove empties and re-sort
        const active = queues.filter(q => q.students.length > 0);
        if (active.length === 0) break;
        active.sort((a, b) => b.students.length - a.students.length || a.subject.localeCompare(b.subject));

        // Take one from each active queue
        for (const q of active) {
            if (q.students.length > 0) {
                result.push(q.students.shift());
            }
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════
//  SEAT SLOT GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate an ordered list of bench slots across all rooms.
 * Each slot: { roomId, row, col }
 * Order: room alphabetically → row 1..R → col 1..C
 */
function buildSeatSlots(rooms, mode) {
    const slots = [];
    // Rooms should already be sorted by room_code
    const sorted = [...rooms].sort((a, b) => a.room_code.localeCompare(b.room_code));

    for (const room of sorted) {
        for (let r = 1; r <= room.rows; r++) {
            for (let c = 1; c <= room.columns; c++) {
                slots.push({
                    roomId: room.id,
                    roomCode: room.room_code,
                    row: r,
                    col: c
                });
            }
        }
    }
    return slots;
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY: group by subject
// ═══════════════════════════════════════════════════════════════

/**
 * Group students by subject_name, sorting each group by roll_number.
 * @returns {Object<string, Array>}
 */
function groupBySubject(students) {
    const groups = {};
    for (const s of students) {
        const key = s.subject_name;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    }
    // Sort each group by roll number for determinism
    for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => {
            const ra = parseInt(a.roll_number, 10);
            const rb = parseInt(b.roll_number, 10);
            if (!isNaN(ra) && !isNaN(rb)) return ra - rb;
            return String(a.roll_number).localeCompare(String(b.roll_number));
        });
    }
    return groups;
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY: group by branch
// ═══════════════════════════════════════════════════════════════

/**
 * Group students by branch_code, sorting each group by roll_number.
 * @returns {Object<string, Array>}
 */
function groupByBranch(students) {
    const groups = {};
    for (const s of students) {
        const key = s.branch_code;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    }
    // Sort each group by roll number for determinism
    for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => {
            const ra = parseInt(a.roll_number, 10);
            const rb = parseInt(b.roll_number, 10);
            if (!isNaN(ra) && !isNaN(rb)) return ra - rb;
            return String(a.roll_number).localeCompare(String(b.roll_number));
        });
    }
    return groups;
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY: build room-wise summary
// ═══════════════════════════════════════════════════════════════

/**
 * Analyse allocations to produce a room-wise summary table.
 * Groups by subject → branch → room, showing roll number ranges
 * and student counts — matching university seating chart format.
 *
 * @param {Array} allocations - Flat allocation list with rollNumber, branchCode, subjectName, roomId
 * @param {Array} rooms - Room objects with { id, room_code }
 * @returns {Array<{ sNo, subjectName, branchCode, rollRange, roomCode, count }>}
 */
function buildRoomWiseSummary(allocations, rooms) {
    const roomMap = {};
    for (const r of rooms) {
        roomMap[r.id] = r.room_code;
    }

    // Group allocations by subject → branch → room
    const tree = {};
    for (const a of allocations) {
        const subj = a.subjectName || a.subject_name || '';
        const branch = a.branchCode || a.branch_code || '';
        const roomCode = roomMap[a.roomId || a.room_id] || a.roomCode || a.room_code || '';
        const roll = a.rollNumber || a.roll_number || '';

        if (!tree[subj]) tree[subj] = {};
        if (!tree[subj][branch]) tree[subj][branch] = {};
        if (!tree[subj][branch][roomCode]) tree[subj][branch][roomCode] = [];
        tree[subj][branch][roomCode].push(roll);
    }

    // Build summary rows
    const rows = [];
    let sNo = 1;

    const sortedSubjects = Object.keys(tree).sort();
    for (const subj of sortedSubjects) {
        const branches = Object.keys(tree[subj]).sort();
        for (const branch of branches) {
            const roomCodes = Object.keys(tree[subj][branch]).sort();
            for (const roomCode of roomCodes) {
                const rolls = tree[subj][branch][roomCode];
                // Sort rolls for range calculation
                rolls.sort((a, b) => {
                    const ra = parseInt(a, 10);
                    const rb = parseInt(b, 10);
                    if (!isNaN(ra) && !isNaN(rb)) return ra - rb;
                    return String(a).localeCompare(String(b));
                });

                const rollRange = rolls.length > 0
                    ? `${rolls[0]} – ${rolls[rolls.length - 1]}`
                    : '—';

                rows.push({
                    sNo: sNo++,
                    subjectName: subj,
                    branchCode: branch,
                    rollRange,
                    rollStart: rolls[0] || '',
                    rollEnd: rolls[rolls.length - 1] || '',
                    roomCode,
                    count: rolls.length
                });
            }
        }
    }

    return rows;
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
    allocateSeats,
    buildRoomWiseSummary,
    // Exported for unit testing:
    allocateSingle,
    allocateDouble,
    allocateLinearSingle,
    allocateLinearDouble,
    buildDifferentSubjectPairs,
    roundRobinInterleave,
    buildSeatSlots,
    groupBySubject,
    groupByBranch
};
