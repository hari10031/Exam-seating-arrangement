/**
 * ============================================================
 *  ALLOCATION VALIDATOR
 * ============================================================
 *
 *  Post-allocation validation to ensure correctness.
 *  Runs a battery of checks on the generated allocations.
 *
 *  Checks performed:
 *  1. No student duplicated across seats
 *  2. No seat double-assigned
 *  3. DOUBLE mode: adjacent students on same bench have different subjects
 *  4. Capacity check: assigned ≤ total seats
 *  5. Completeness: all students accounted for (assigned + unassigned = total)
 *
 * ============================================================
 */

/**
 * Validate an allocation result.
 *
 * @param {Object} params
 * @param {Array}  params.allocations - The seat assignments
 * @param {Array}  params.students    - All students in the session
 * @param {Object} params.report      - The summary report from the allocator
 * @param {string} params.mode        - 'SINGLE' | 'DOUBLE'
 * @param {Array}  params.rooms       - Rooms used
 *
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateAllocation({ allocations, students, report, mode, rooms }) {
    const errors = [];
    const warnings = [];

    // ── CHECK 1: No duplicated student ──────────────────────────
    const studentIdSet = new Set();
    for (const a of allocations) {
        if (!a.studentId) continue;
        if (studentIdSet.has(a.studentId)) {
            errors.push(`DUPLICATE_STUDENT: Student ID ${a.studentId} (Roll: ${a.rollNumber}) is assigned to multiple seats.`);
        }
        studentIdSet.add(a.studentId);
    }

    // ── CHECK 2: No seat double-assigned ────────────────────────
    const seatKeys = new Set();
    for (const a of allocations) {
        const key = `${a.roomId}-R${a.rowNumber}-C${a.columnNumber}-${a.seatPosition}`;
        if (seatKeys.has(key)) {
            errors.push(`DUPLICATE_SEAT: Seat ${key} is assigned to multiple students.`);
        }
        seatKeys.add(key);
    }

    // ── CHECK 3: DOUBLE mode subject-difference rule ────────────
    if (mode === 'DOUBLE') {
        // Group allocations by bench (room + row + col)
        const benches = {};
        for (const a of allocations) {
            const benchKey = `${a.roomId}-R${a.rowNumber}-C${a.columnNumber}`;
            if (!benches[benchKey]) benches[benchKey] = {};
            benches[benchKey][a.seatPosition] = a;
        }

        for (const [benchKey, seats] of Object.entries(benches)) {
            if (seats.A && seats.B) {
                if (seats.A.subjectName && seats.B.subjectName) {
                    if (seats.A.subjectName === seats.B.subjectName) {
                        errors.push(
                            `SAME_SUBJECT_PAIR: Bench ${benchKey} has two students with the same subject ` +
                            `"${seats.A.subjectName}" (Rolls: ${seats.A.rollNumber}, ${seats.B.rollNumber}).`
                        );
                    }
                }
            }
        }
    }

    // ── CHECK 4: Capacity ──────────────────────────────────────
    const totalSeats = rooms.reduce((sum, r) => {
        const benches = r.rows * r.columns;
        return sum + (mode === 'DOUBLE' ? benches * 2 : benches);
    }, 0);

    if (report.assignedCount > totalSeats) {
        errors.push(
            `OVER_CAPACITY: Assigned ${report.assignedCount} students but only ${totalSeats} seats available.`
        );
    }

    if (report.assignedCount < students.length && report.unassignedCount === 0) {
        errors.push(
            `ACCOUNTING_ERROR: ${students.length - report.assignedCount} students are neither assigned nor reported as unassigned.`
        );
    }

    // ── CHECK 5: Completeness ─────────────────────────────────
    if (report.assignedCount + report.unassignedCount !== report.totalStudents) {
        errors.push(
            `COMPLETENESS: assigned(${report.assignedCount}) + unassigned(${report.unassignedCount}) ` +
            `≠ total(${report.totalStudents}).`
        );
    }

    // ── WARNINGS ──────────────────────────────────────────────
    if (report.unassignedCount > 0) {
        warnings.push(`${report.unassignedCount} student(s) could not be assigned seats.`);
    }

    const utilization = totalSeats > 0 ? (report.assignedCount / totalSeats * 100).toFixed(1) : 0;
    if (utilization < 50 && students.length > 0) {
        warnings.push(`Low seat utilization: ${utilization}%. Consider using fewer rooms.`);
    }

    // Check subject distribution evenness in SINGLE mode
    if (mode === 'SINGLE' && allocations.length > 1) {
        const consecutiveSameSubject = countMaxConsecutiveSameSubject(allocations);
        if (consecutiveSameSubject > 3) {
            warnings.push(
                `Subject clustering detected: up to ${consecutiveSameSubject} consecutive same-subject seats. ` +
                `This may indicate uneven subject distribution.`
            );
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
            totalStudents: report.totalStudents,
            totalSeats,
            assignedCount: report.assignedCount,
            unassignedCount: report.unassignedCount,
            utilization: `${utilization}%`,
            mode
        }
    };
}

/**
 * Count the maximum run of consecutive seats with the same subject.
 * Used to detect clustering.
 */
function countMaxConsecutiveSameSubject(allocations) {
    let maxRun = 1;
    let currentRun = 1;
    for (let i = 1; i < allocations.length; i++) {
        if (
            allocations[i].subjectName &&
            allocations[i].subjectName === allocations[i - 1].subjectName &&
            allocations[i].roomId === allocations[i - 1].roomId
        ) {
            currentRun++;
            maxRun = Math.max(maxRun, currentRun);
        } else {
            currentRun = 1;
        }
    }
    return maxRun;
}

module.exports = { validateAllocation };
