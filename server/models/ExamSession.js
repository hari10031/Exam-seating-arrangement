/**
 * EXAM SESSION MODEL
 * ==================
 * Manages exam sessions and their relationships
 * to rooms, branches, subjects, and students.
 */
const { getDb } = require('../db/connection');

const ExamSessionModel = {
    // ─── SESSION CRUD ────────────────────────────────────────────

    create({ sessionName, examDate, startTime, endTime, seatingMode, allocationMethod, year, slot }) {
        const db = getDb();
        const stmt = db.prepare(`
      INSERT INTO exam_sessions (session_name, exam_date, start_time, end_time, seating_mode, allocation_method, year, slot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(
            sessionName,
            examDate,
            startTime || null,
            endTime || null,
            seatingMode || 'SINGLE',
            allocationMethod || 'INTERLEAVED',
            year || null,
            slot || null
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
        const allowed = ['session_name', 'exam_date', 'start_time', 'end_time', 'seating_mode', 'allocation_method', 'status', 'slot'];
        const mapping = {
            sessionName: 'session_name',
            examDate: 'exam_date',
            startTime: 'start_time',
            endTime: 'end_time',
            seatingMode: 'seating_mode',
            allocationMethod: 'allocation_method',
            status: 'status',
            year: 'year',
            slot: 'slot'
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
        const ins = db.prepare('INSERT OR IGNORE INTO session_rooms (session_id, room_id) VALUES (?, ?)');
        const txn = db.transaction(() => {
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
        const ins = db.prepare(`
      INSERT OR IGNORE INTO session_branch_subjects (session_id, branch_id, subject_id)
      VALUES (?, ?, ?)
    `);
        const txn = db.transaction(() => {
            for (const { branchId, subjectId } of mappings) {
                ins.run(sessionId, branchId, subjectId);
            }
        });
        txn();
    },

    getBranchSubjects(sessionId) {
        const db = getDb();
        return db.prepare(`
      SELECT sbs.*, b.branch_code, b.branch_name, b.section as branch_section,
             s.subject_code, s.subject_name,
             ybs.subject_type
      FROM session_branch_subjects sbs
      JOIN branches b ON b.id = sbs.branch_id
      JOIN subjects s ON s.id = sbs.subject_id
      JOIN exam_sessions es ON es.id = sbs.session_id
      LEFT JOIN year_branch_subjects ybs
        ON ybs.year = es.year AND ybs.branch_id = sbs.branch_id AND ybs.subject_id = sbs.subject_id
      WHERE sbs.session_id = ?
      ORDER BY b.branch_code, b.section
    `).all(sessionId);
    },

    // ─── STUDENTS ───────────────────────────────────────────────

    /**
     * Expand roll-number ranges → individual student rows.
     * @param {number} sessionId
     * @param {Array<{branchId, subjectId, ranges: [{start,end}], exclude: (string|number)[], include: (string|number)[]}>} entries
     */
    setStudents(sessionId, entries) {
        const db = getDb();
        const ins = db.prepare(`
      INSERT OR IGNORE INTO students (session_id, branch_id, subject_id, roll_number)
      VALUES (?, ?, ?, ?)
    `);
        const txn = db.transaction(() => {
            for (const entry of entries) {
                const rollSet = expandRolls(entry.ranges, entry.exclude, entry.include);
                for (const roll of rollSet) {
                    ins.run(sessionId, entry.branchId, entry.subjectId, roll);
                }
            }
        });
        txn();
    },

    /**
     * Set students from the student_master DB instead of roll ranges.
     * @param {number} sessionId
     * @param {Array<{branchId, subjectId, rollNumbers: string[], exclude: string[]}>} entries
     */
    setStudentsFromDb(sessionId, entries) {
        const db = getDb();
        const ins = db.prepare(`
      INSERT OR IGNORE INTO students (session_id, branch_id, subject_id, roll_number, student_name)
      VALUES (?, ?, ?, ?, ?)
    `);
        // Lookup student details (name + section) from student_master
        const lookupMaster = db.prepare(
            'SELECT student_name, section, branch_code FROM student_master WHERE roll_number = ?'
        );
        // Find section-specific branch
        const lookupSectionBranch = db.prepare(
            'SELECT id FROM branches WHERE branch_code = ? AND section = ?'
        );
        // Cache section branch lookups
        const sectionBranchCache = {};

        const txn = db.transaction(() => {
            for (const entry of entries) {
                const excludeSet = new Set((entry.exclude || []).map(r => String(r).trim()));
                const rolls = (entry.rollNumbers || []).filter(r => !excludeSet.has(String(r).trim()));

                // Add extra includes
                if (entry.include && entry.include.length > 0) {
                    for (const r of entry.include) {
                        if (!rolls.includes(String(r).trim())) {
                            rolls.push(String(r).trim());
                        }
                    }
                }

                for (const roll of rolls) {
                    const master = lookupMaster.get(roll);
                    const name = master ? master.student_name : null;

                    // Resolve section-specific branch_id if student has a section
                    let branchId = entry.branchId;
                    if (master && master.section) {
                        const cacheKey = `${master.branch_code}::${master.section}`;
                        if (sectionBranchCache[cacheKey] === undefined) {
                            const secBranch = lookupSectionBranch.get(master.branch_code, master.section);
                            sectionBranchCache[cacheKey] = secBranch ? secBranch.id : null;
                        }
                        if (sectionBranchCache[cacheKey] !== null) {
                            branchId = sectionBranchCache[cacheKey];
                        }
                    }

                    ins.run(sessionId, branchId, entry.subjectId, roll, name);
                }
            }
        });
        txn();
    },

    getStudents(sessionId) {
        const db = getDb();
        return db.prepare(`
      SELECT st.*, b.branch_code, b.section as branch_section, s.subject_name
      FROM students st
      JOIN branches b ON b.id = st.branch_id
      JOIN subjects s ON s.id = st.subject_id
      WHERE st.session_id = ?
      ORDER BY b.branch_code, b.section, st.roll_number
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
 * Robust roll-number range expander.
 *
 * Supports TWO formats:
 *
 * 1. **Hyphenated (university standard)**:
 *    `2451-23-733-001` → `2451-23-733-020`
 *    Splits on `-` into exactly 4 blocks.
 *    First 3 blocks form the prefix and MUST match between start and end.
 *    Last block is the numeric suffix; leading-zero width is preserved.
 *
 * 2. **Plain integer (legacy)**:
 *    `101` → `130`
 *    Simple numeric range, backwards-compatible with earlier data.
 *
 * @param {Array<{start: string|number, end: string|number}>} ranges
 * @param {Array<string|number>} exclude  - roll numbers to remove
 * @param {Array<string|number>} include  - extra rolls to add manually
 * @returns {string[]} ordered list of roll number strings
 */
function expandRolls(ranges = [], exclude = [], include = []) {
    const rollSet = new Set();

    for (const { start, end } of ranges) {
        const startStr = String(start).trim();
        const endStr = String(end).trim();

        const isHyphenatedStart = startStr.includes('-');
        const isHyphenatedEnd = endStr.includes('-');

        if (isHyphenatedStart || isHyphenatedEnd) {
            // ── Hyphenated format: XXXX-XX-XXX-NNN ──
            const generated = expandHyphenatedRange(startStr, endStr);
            for (const r of generated) rollSet.add(r);
        } else {
            // ── Plain integer format (legacy) ──
            const s = parseInt(startStr, 10);
            const e = parseInt(endStr, 10);
            if (isNaN(s) || isNaN(e)) {
                throw new Error(`Invalid plain roll range: "${startStr}" → "${endStr}"`);
            }
            if (s > e) {
                throw new Error(`Start roll ${s} is greater than end roll ${e}`);
            }
            for (let r = s; r <= e; r++) {
                rollSet.add(String(r));
            }
        }
    }

    // Exclusions — match as strings (works for both formats)
    const excludeSet = new Set(exclude.map(r => String(r).trim()));
    for (const r of excludeSet) {
        rollSet.delete(r);
    }

    // Manual inclusions
    for (const r of include) {
        rollSet.add(String(r).trim());
    }

    // Sort: attempt numeric-aware sort
    return Array.from(rollSet).sort((a, b) => {
        // For hyphenated rolls, compare the suffix numerically
        const pa = a.split('-');
        const pb = b.split('-');
        if (pa.length === 4 && pb.length === 4) {
            // Compare prefix blocks first
            for (let i = 0; i < 3; i++) {
                const cmp = pa[i].localeCompare(pb[i]);
                if (cmp !== 0) return cmp;
            }
            // Then compare suffix numerically
            return parseInt(pa[3], 10) - parseInt(pb[3], 10);
        }
        // Fallback: numeric then string
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
    });
}

/**
 * Expand a hyphenated roll-number range.
 *
 * Format: `PREFIX-SUFFIX` where PREFIX = first 3 dash-separated blocks,
 * SUFFIX = last block (numeric with preserved leading zeros).
 *
 * Rules:
 * - Both start and end must split into exactly 4 blocks on `-`.
 * - First 3 blocks (prefix) must match exactly.
 * - Last block is interpreted as integer; width = max(startWidth, endWidth).
 * - start suffix ≤ end suffix (else → error).
 * - Leading zeros preserved based on suffix width.
 *
 * @param {string} startRoll  e.g. "2451-23-733-001"
 * @param {string} endRoll    e.g. "2451-23-733-020"
 * @returns {string[]} array of roll number strings
 */
function expandHyphenatedRange(startRoll, endRoll) {
    const partsA = startRoll.split('-');
    const partsB = endRoll.split('-');

    if (partsA.length !== 4) {
        throw new Error(
            `Invalid roll format "${startRoll}": expected 4 dash-separated blocks (e.g. 2451-23-733-001), got ${partsA.length}`
        );
    }
    if (partsB.length !== 4) {
        throw new Error(
            `Invalid roll format "${endRoll}": expected 4 dash-separated blocks (e.g. 2451-23-733-020), got ${partsB.length}`
        );
    }

    // Validate prefix match (blocks 0, 1, 2)
    const prefixA = partsA.slice(0, 3).join('-');
    const prefixB = partsB.slice(0, 3).join('-');
    if (prefixA !== prefixB) {
        throw new Error(
            `Prefix mismatch: "${prefixA}" ≠ "${prefixB}". ` +
            `Start and end rolls must share the same first 3 blocks.`
        );
    }

    const suffixStrA = partsA[3];
    const suffixStrB = partsB[3];

    // Validate suffixes are numeric
    if (!/^\d+$/.test(suffixStrA)) {
        throw new Error(`Non-numeric suffix in start roll: "${suffixStrA}"`);
    }
    if (!/^\d+$/.test(suffixStrB)) {
        throw new Error(`Non-numeric suffix in end roll: "${suffixStrB}"`);
    }

    const suffixA = parseInt(suffixStrA, 10);
    const suffixB = parseInt(suffixStrB, 10);

    if (suffixA > suffixB) {
        throw new Error(
            `Start suffix (${suffixStrA}=${suffixA}) > end suffix (${suffixStrB}=${suffixB}). ` +
            `Range must go from smaller to larger.`
        );
    }

    // Determine zero-padding width: use the LONGER suffix string
    // This safely normalizes width mismatches (e.g. "01" vs "100" → width 3)
    const padWidth = Math.max(suffixStrA.length, suffixStrB.length);

    const rolls = [];
    for (let n = suffixA; n <= suffixB; n++) {
        const suffix = String(n).padStart(padWidth, '0');
        rolls.push(`${prefixA}-${suffix}`);
    }

    return rolls;
}

module.exports = ExamSessionModel;
module.exports.expandRolls = expandRolls;
module.exports.expandHyphenatedRange = expandHyphenatedRange;
module.exports.expandRolls = expandRolls;
