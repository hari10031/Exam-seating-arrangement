/**
 * EXAM SESSION MODEL
 * ==================
 * Manages exam sessions and their relationships
 * to rooms, branches, subjects, and students.
 */
const { getDb } = require('../db/connection');

const ExamSessionModel = {
    // ─── SESSION CRUD ────────────────────────────────────────────

    create({ sessionName, examDate, startTime, endTime, seatingMode, allocationMethod }) {
        const db = getDb();
        const stmt = db.prepare(`
      INSERT INTO exam_sessions (session_name, exam_date, start_time, end_time, seating_mode, allocation_method)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(
            sessionName,
            examDate,
            startTime || null,
            endTime || null,
            seatingMode || 'SINGLE',
            allocationMethod || 'INTERLEAVED'
        );
        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(id);
    },

    getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM exam_sessions ORDER BY exam_date DESC, id DESC').all();
    },

    update(id, fields) {
        const db = getDb();
        const allowed = ['session_name', 'exam_date', 'start_time', 'end_time', 'seating_mode', 'allocation_method', 'status'];
        const mapping = {
            sessionName: 'session_name',
            examDate: 'exam_date',
            startTime: 'start_time',
            endTime: 'end_time',
            seatingMode: 'seating_mode',
            allocationMethod: 'allocation_method',
            status: 'status'
        };
        const sets = [];
        const vals = [];
        for (const [jsKey, dbKey] of Object.entries(mapping)) {
            if (fields[jsKey] !== undefined) {
                sets.push(`${dbKey} = ?`);
                vals.push(fields[jsKey]);
            }
        }
        if (sets.length === 0) return this.getById(id);
        vals.push(id);
        db.prepare(`UPDATE exam_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        return this.getById(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM exam_sessions WHERE id = ?').run(id);
    },

    // ─── ROOM ASSIGNMENT ────────────────────────────────────────

    assignRooms(sessionId, roomIds) {
        const db = getDb();
        const del = db.prepare('DELETE FROM session_rooms WHERE session_id = ?');
        const ins = db.prepare('INSERT INTO session_rooms (session_id, room_id) VALUES (?, ?)');
        const txn = db.transaction(() => {
            del.run(sessionId);
            for (const roomId of roomIds) {
                ins.run(sessionId, roomId);
            }
        });
        txn();
    },

    getRooms(sessionId) {
        const db = getDb();
        return db.prepare(`
      SELECT r.* FROM rooms r
      INNER JOIN session_rooms sr ON sr.room_id = r.id
      WHERE sr.session_id = ?
      ORDER BY r.room_code
    `).all(sessionId);
    },

    // ─── BRANCH-SUBJECT MAPPING ─────────────────────────────────

    assignBranchSubjects(sessionId, mappings) {
        const db = getDb();
        const del = db.prepare('DELETE FROM session_branch_subjects WHERE session_id = ?');
        const ins = db.prepare(`
      INSERT INTO session_branch_subjects (session_id, branch_id, subject_id)
      VALUES (?, ?, ?)
    `);
        const txn = db.transaction(() => {
            del.run(sessionId);
            for (const { branchId, subjectId } of mappings) {
                ins.run(sessionId, branchId, subjectId);
            }
        });
        txn();
    },

    getBranchSubjects(sessionId) {
        const db = getDb();
        return db.prepare(`
      SELECT sbs.*, b.branch_code, b.branch_name, s.subject_code, s.subject_name
      FROM session_branch_subjects sbs
      JOIN branches b ON b.id = sbs.branch_id
      JOIN subjects s ON s.id = sbs.subject_id
      WHERE sbs.session_id = ?
      ORDER BY b.branch_code
    `).all(sessionId);
    },

    // ─── STUDENTS ───────────────────────────────────────────────

    /**
     * Expand roll-number ranges → individual student rows.
     * @param {number} sessionId
     * @param {Array<{branchId, subjectId, ranges: [{start,end}], exclude: number[], include: number[]}>} entries
     */
    setStudents(sessionId, entries) {
        const db = getDb();
        const del = db.prepare('DELETE FROM students WHERE session_id = ?');
        const ins = db.prepare(`
      INSERT INTO students (session_id, branch_id, subject_id, roll_number)
      VALUES (?, ?, ?, ?)
    `);
        const txn = db.transaction(() => {
            del.run(sessionId);
            for (const entry of entries) {
                const rollSet = expandRolls(entry.ranges, entry.exclude, entry.include);
                for (const roll of rollSet) {
                    ins.run(sessionId, entry.branchId, entry.subjectId, String(roll));
                }
            }
        });
        txn();
    },

    getStudents(sessionId) {
        const db = getDb();
        return db.prepare(`
      SELECT st.*, b.branch_code, s.subject_name
      FROM students st
      JOIN branches b ON b.id = st.branch_id
      JOIN subjects s ON s.id = st.subject_id
      WHERE st.session_id = ?
      ORDER BY b.branch_code, st.roll_number
    `).all(sessionId);
    },

    getStudentsBySubject(sessionId) {
        const students = this.getStudents(sessionId);
        const grouped = {};
        for (const st of students) {
            const key = st.subject_name;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(st);
        }
        return grouped;
    },

    // ─── FULL SESSION DETAILS ───────────────────────────────────

    getFullDetails(sessionId) {
        const session = this.getById(sessionId);
        if (!session) return null;
        return {
            ...session,
            rooms: this.getRooms(sessionId),
            branchSubjects: this.getBranchSubjects(sessionId),
            students: this.getStudents(sessionId)
        };
    }
};

// ─── UTILITY: expand roll ranges ─────────────────────────────

/**
 * Given ranges [{start, end}], exclusions, and manual inclusions,
 * produce a deduplicated sorted list of roll numbers.
 */
function expandRolls(ranges = [], exclude = [], include = []) {
    const rollSet = new Set();

    for (const { start, end } of ranges) {
        for (let r = start; r <= end; r++) {
            rollSet.add(r);
        }
    }

    for (const r of exclude) {
        rollSet.delete(r);
    }

    for (const r of include) {
        rollSet.add(r);
    }

    return Array.from(rollSet).sort((a, b) => a - b);
}

module.exports = ExamSessionModel;
module.exports.expandRolls = expandRolls;
