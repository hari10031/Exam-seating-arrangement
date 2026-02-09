/**
 * SEAT ALLOCATION MODEL
 * =====================
 * Persistence layer for allocation results.
 */
const { getDb } = require('../db/connection');

const AllocationModel = {
    /**
     * Bulk-insert allocation results for a session.
     * Each entry: { sessionId, roomId, rowNumber, columnNumber, seatPosition, studentId, rollNumber, branchCode, subjectName }
     */
    saveAllocations(sessionId, allocations) {
        const db = getDb();
        const del = db.prepare('DELETE FROM seat_allocations WHERE session_id = ?');
        const ins = db.prepare(`
      INSERT INTO seat_allocations
        (session_id, room_id, row_number, column_number, seat_position, student_id, roll_number, branch_code, subject_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const txn = db.transaction(() => {
            del.run(sessionId);
            for (const a of allocations) {
                ins.run(
                    sessionId,
                    a.roomId,
                    a.rowNumber,
                    a.columnNumber,
                    a.seatPosition,
                    a.studentId || null,
                    a.rollNumber || null,
                    a.branchCode || null,
                    a.subjectName || null
                );
            }
        });
        txn();
    },

    /**
     * Get all allocations for a session, ordered by room → row → col → seat.
     */
    getBySession(sessionId) {
        const db = getDb();
        return db.prepare(`
      SELECT sa.*, r.room_code
      FROM seat_allocations sa
      JOIN rooms r ON r.id = sa.room_id
      WHERE sa.session_id = ?
      ORDER BY r.room_code, sa.row_number, sa.column_number, sa.seat_position
    `).all(sessionId);
    },

    /**
     * Get allocations grouped by room.
     */
    getBySessionGrouped(sessionId) {
        const allocs = this.getBySession(sessionId);
        const rooms = {};
        for (const a of allocs) {
            if (!rooms[a.room_code]) {
                rooms[a.room_code] = {
                    roomCode: a.room_code,
                    roomId: a.room_id,
                    seats: []
                };
            }
            rooms[a.room_code].seats.push(a);
        }
        return Object.values(rooms);
    },

    /**
     * Build a 2D grid representation for a specific room.
     * Returns { roomCode, grid: [ [bench, bench, ...], ... ] }
     * Each bench: { row, col, seatA: {...}|null, seatB: {...}|null }
     */
    getRoomGrid(sessionId, roomId) {
        const db = getDb();
        const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
        if (!room) return null;

        const allocs = db.prepare(`
      SELECT * FROM seat_allocations
      WHERE session_id = ? AND room_id = ?
      ORDER BY row_number, column_number, seat_position
    `).all(sessionId, roomId);

        // Build empty grid
        const grid = [];
        for (let r = 1; r <= room.rows; r++) {
            const row = [];
            for (let c = 1; c <= room.columns; c++) {
                row.push({ row: r, col: c, seatA: null, seatB: null });
            }
            grid.push(row);
        }

        // Fill in allocations
        for (const a of allocs) {
            const bench = grid[a.row_number - 1]?.[a.column_number - 1];
            if (!bench) continue;
            const seatData = {
                rollNumber: a.roll_number,
                branchCode: a.branch_code,
                subjectName: a.subject_name,
                studentId: a.student_id
            };
            if (a.seat_position === 'A') bench.seatA = seatData;
            else bench.seatB = seatData;
        }

        return { roomCode: room.room_code, roomId: room.id, rows: room.rows, columns: room.columns, grid };
    },

    // ─── VALIDATION REPORT ────────────────────────────────────────

    saveReport(sessionId, report) {
        const db = getDb();
        db.prepare('DELETE FROM allocation_reports WHERE session_id = ?').run(sessionId);
        db.prepare(`
      INSERT INTO allocation_reports
        (session_id, total_students, total_seats, assigned_count, unassigned_count, unassigned_reasons)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            sessionId,
            report.totalStudents,
            report.totalSeats,
            report.assignedCount,
            report.unassignedCount,
            JSON.stringify(report.unassignedReasons || [])
        );
    },

    getReport(sessionId) {
        const db = getDb();
        const row = db.prepare('SELECT * FROM allocation_reports WHERE session_id = ?').get(sessionId);
        if (row && row.unassigned_reasons) {
            row.unassignedReasons = JSON.parse(row.unassigned_reasons);
        }
        return row;
    }
};

module.exports = AllocationModel;
