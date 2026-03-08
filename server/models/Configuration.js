/**
 * CONFIGURATION MODEL
 * ====================
 * Manages:
 *  - Year → Branch → Subject mappings (curriculum)
 *  - Student elective choices (PE/OE)
 *  - Exam timetable (date+slot → branch → subject)
 *  - Student master data with year
 */
const { getDb } = require('../db/connection');

const ConfigurationModel = {

    // ═══════════════════════════════════════════════════════════
    //  YEAR → BRANCH → SUBJECT MAPPING
    // ═══════════════════════════════════════════════════════════

    /**
     * Set subject mappings for a given year.
     * Each mapping: { branchId, subjectId, subjectType }
     * subjectType: 'REGULAR' | 'PE' | 'OE'
     */
    setYearBranchSubjects(year, mappings) {
        const db = getDb();
        const del = db.prepare('DELETE FROM year_branch_subjects WHERE year = ?');
        const ins = db.prepare(`
            INSERT OR REPLACE INTO year_branch_subjects (year, branch_id, subject_id, subject_type)
            VALUES (?, ?, ?, ?)
        `);
        const txn = db.transaction(() => {
            del.run(year);
            for (const m of mappings) {
                ins.run(year, m.branchId, m.subjectId, m.subjectType || 'REGULAR');
            }
        });
        txn();
    },

    /**
     * Add mappings without clearing existing ones.
     */
    addYearBranchSubjects(year, mappings) {
        const db = getDb();
        const ins = db.prepare(`
            INSERT OR REPLACE INTO year_branch_subjects (year, branch_id, subject_id, subject_type)
            VALUES (?, ?, ?, ?)
        `);
        const txn = db.transaction(() => {
            for (const m of mappings) {
                ins.run(year, m.branchId, m.subjectId, m.subjectType || 'REGULAR');
            }
        });
        txn();
    },

    /**
     * Get all subjects for a specific year (optionally filtered by branch).
     */
    getYearBranchSubjects(year, branchId = null) {
        const db = getDb();
        let sql = `
            SELECT ybs.*, b.branch_code, b.branch_name, s.subject_code, s.subject_name
            FROM year_branch_subjects ybs
            JOIN branches b ON b.id = ybs.branch_id
            JOIN subjects s ON s.id = ybs.subject_id
            WHERE ybs.year = ?
        `;
        const params = [year];
        if (branchId) {
            sql += ' AND ybs.branch_id = ?';
            params.push(branchId);
        }
        sql += ' ORDER BY b.branch_code, ybs.subject_type, s.subject_code';
        return db.prepare(sql).all(...params);
    },

    /**
     * Get all year-branch-subject mappings grouped by year.
     */
    getAllYearBranchSubjects() {
        const db = getDb();
        return db.prepare(`
            SELECT ybs.*, b.branch_code, b.branch_name, s.subject_code, s.subject_name
            FROM year_branch_subjects ybs
            JOIN branches b ON b.id = ybs.branch_id
            JOIN subjects s ON s.id = ybs.subject_id
            ORDER BY ybs.year, b.branch_code, ybs.subject_type, s.subject_code
        `).all();
    },

    /**
     * Get distinct years that have mappings configured.
     */
    getConfiguredYears() {
        const db = getDb();
        return db.prepare('SELECT DISTINCT year FROM year_branch_subjects ORDER BY year').all()
            .map(r => r.year);
    },

    /**
     * Get branches that have subjects configured for a given year.
     */
    getBranchesForYear(year) {
        const db = getDb();
        return db.prepare(`
            SELECT DISTINCT b.id, b.branch_code, b.branch_name
            FROM year_branch_subjects ybs
            JOIN branches b ON b.id = ybs.branch_id
            WHERE ybs.year = ?
            ORDER BY b.branch_code
        `).all(year);
    },

    /**
     * Delete all mappings for a year.
     */
    deleteYearMappings(year) {
        const db = getDb();
        db.prepare('DELETE FROM year_branch_subjects WHERE year = ?').run(year);
    },

    // ═══════════════════════════════════════════════════════════
    //  STUDENT ELECTIVE CHOICES
    // ═══════════════════════════════════════════════════════════

    /**
     * Set elective choices for students.
     * Each choice: { rollNumber, subjectId, year, electiveType }
     */
    setStudentElectives(choices) {
        const db = getDb();
        const ins = db.prepare(`
            INSERT OR REPLACE INTO student_electives (roll_number, subject_id, year, elective_type)
            VALUES (?, ?, ?, ?)
        `);
        const txn = db.transaction(() => {
            for (const c of choices) {
                ins.run(c.rollNumber, c.subjectId, c.year, c.electiveType);
            }
        });
        txn();
    },

    /**
     * Get elective choices for a roll number.
     */
    getStudentElectives(rollNumber) {
        const db = getDb();
        return db.prepare(`
            SELECT se.*, s.subject_code, s.subject_name
            FROM student_electives se
            JOIN subjects s ON s.id = se.subject_id
            WHERE se.roll_number = ?
            ORDER BY se.year, se.elective_type
        `).all(rollNumber);
    },

    /**
     * Get all elective choices for a year and type.
     */
    getElectivesByYearType(year, electiveType) {
        const db = getDb();
        return db.prepare(`
            SELECT se.*, s.subject_code, s.subject_name
            FROM student_electives se
            JOIN subjects s ON s.id = se.subject_id
            WHERE se.year = ? AND se.elective_type = ?
            ORDER BY se.roll_number
        `).all(year, electiveType);
    },

    /**
     * Get ALL elective choices for a year (both PE and OE).
     */
    getElectivesByYear(year) {
        const db = getDb();
        return db.prepare(`
            SELECT se.*, s.subject_code, s.subject_name
            FROM student_electives se
            JOIN subjects s ON s.id = se.subject_id
            WHERE se.year = ?
            ORDER BY se.elective_type, se.roll_number
        `).all(year);
    },

    /**
     * Clear all elective choices for a year and type.
     */
    clearElectives(year, electiveType) {
        const db = getDb();
        db.prepare('DELETE FROM student_electives WHERE year = ? AND elective_type = ?')
            .run(year, electiveType);
    },

    // ═══════════════════════════════════════════════════════════
    //  EXAM TIMETABLE
    // ═══════════════════════════════════════════════════════════

    /**
     * Set exam timetable entries.
     * Each entry: { year, branchId, subjectId, examDate, slot }
     */
    setExamTimetable(entries) {
        const db = getDb();
        const ins = db.prepare(`
            INSERT OR REPLACE INTO exam_timetable (year, branch_id, subject_id, exam_date, slot, time_slot)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const txn = db.transaction(() => {
            for (const e of entries) {
                ins.run(e.year, e.branchId, e.subjectId, e.examDate, e.slot || null, e.timeSlot || null);
            }
        });
        txn();
    },

    /**
     * Clear and replace the timetable for a given year.
     */
    replaceExamTimetable(year, entries) {
        const db = getDb();
        const del = db.prepare('DELETE FROM exam_timetable WHERE year = ?');
        const ins = db.prepare(`
            INSERT INTO exam_timetable (year, branch_id, subject_id, exam_date, slot, time_slot)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const txn = db.transaction(() => {
            del.run(year);
            for (const e of entries) {
                ins.run(year, e.branchId, e.subjectId, e.examDate, e.slot || null, e.timeSlot || null);
            }
        });
        txn();
    },

    /**
     * Get timetable entries for a date and optional slot.
     */
    getExamTimetableByDate(examDate, timeSlot = null) {
        const db = getDb();
        let sql = `
            SELECT et.*, b.branch_code, b.branch_name, s.subject_code, s.subject_name,
                   ybs.subject_type
            FROM exam_timetable et
            JOIN branches b ON b.id = et.branch_id
            JOIN subjects s ON s.id = et.subject_id
            LEFT JOIN year_branch_subjects ybs
              ON ybs.year = et.year AND ybs.branch_id = et.branch_id AND ybs.subject_id = et.subject_id
            WHERE et.exam_date = ?
        `;
        const params = [examDate];
        if (timeSlot) {
            sql += ' AND et.time_slot = ?';
            params.push(timeSlot);
        }
        sql += ' ORDER BY et.year, b.branch_code';
        return db.prepare(sql).all(...params);
    },

    /**
     * Get all timetable entries for a year.
     */
    getExamTimetableByYear(year) {
        const db = getDb();
        return db.prepare(`
            SELECT et.*, b.branch_code, b.branch_name, s.subject_code, s.subject_name
            FROM exam_timetable et
            JOIN branches b ON b.id = et.branch_id
            JOIN subjects s ON s.id = et.subject_id
            WHERE et.year = ?
            ORDER BY et.exam_date, et.slot, b.branch_code
        `).all(year);
    },

    /**
     * Get full timetable.
     */
    getAllExamTimetable() {
        const db = getDb();
        return db.prepare(`
            SELECT et.*, b.branch_code, b.branch_name, s.subject_code, s.subject_name
            FROM exam_timetable et
            JOIN branches b ON b.id = et.branch_id
            JOIN subjects s ON s.id = et.subject_id
            ORDER BY et.year, et.exam_date, et.slot, b.branch_code
        `).all();
    },

    /**
     * Get unique exam dates from timetable, optionally filtered by year.
     */
    getExamDates(year = null) {
        const db = getDb();
        if (year) {
            return db.prepare(`
                SELECT DISTINCT exam_date FROM exam_timetable
                WHERE year = ? ORDER BY exam_date
            `).all(year).map(r => r.exam_date);
        }
        return db.prepare(`
            SELECT DISTINCT exam_date FROM exam_timetable ORDER BY exam_date
        `).all().map(r => r.exam_date);
    },

    /**
     * Get unique time slots for a given date (and optional year).
     * Returns time_slot values like "10:00-11:10", "2:30-3:40".
     */
    getSlotsForDate(examDate, year = null) {
        const db = getDb();
        if (year) {
            return db.prepare(`
                SELECT DISTINCT time_slot FROM exam_timetable
                WHERE exam_date = ? AND year = ? AND time_slot IS NOT NULL ORDER BY time_slot
            `).all(examDate, year).map(r => r.time_slot);
        }
        return db.prepare(`
            SELECT DISTINCT time_slot FROM exam_timetable
            WHERE exam_date = ? AND time_slot IS NOT NULL ORDER BY time_slot
        `).all(examDate).map(r => r.time_slot);
    },

    /**
     * Get unique years from timetable.
     */
    getTimetableYears() {
        const db = getDb();
        return db.prepare(`
            SELECT DISTINCT year FROM exam_timetable ORDER BY year
        `).all().map(r => r.year);
    },

    /**
     * Delete timetable for a year.
     */
    deleteExamTimetable(year) {
        const db = getDb();
        db.prepare('DELETE FROM exam_timetable WHERE year = ?').run(year);
    },

    // ═══════════════════════════════════════════════════════════
    //  STUDENT MASTER (with year)
    // ═══════════════════════════════════════════════════════════

    /**
     * Get all students from student_master for a year and branch.
     */
    getStudentsByYearBranch(year, branchCode) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM student_master
            WHERE year = ? AND branch_code = ?
            ORDER BY roll_number
        `).all(year, branchCode);
    },

    /**
     * Get all students for a year.
     */
    getStudentsByYear(year) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM student_master
            WHERE year = ?
            ORDER BY branch_code, roll_number
        `).all(year);
    },

    /**
     * Get distinct branches from student_master for a year.
     */
    getStudentBranchesForYear(year) {
        const db = getDb();
        return db.prepare(`
            SELECT DISTINCT sm.branch_code, b.id as branch_id, b.branch_name
            FROM student_master sm
            LEFT JOIN branches b ON UPPER(b.branch_code) = UPPER(sm.branch_code)
            WHERE sm.year = ?
            ORDER BY sm.branch_code
        `).all(year);
    },

    /**
     * Get roll numbers for a specific year and branch.
     */
    getRollNumbers(year, branchCode) {
        const db = getDb();
        return db.prepare(`
            SELECT roll_number, student_name FROM student_master
            WHERE year = ? AND UPPER(branch_code) = UPPER(?)
            ORDER BY roll_number
        `).all(year, branchCode);
    },

    /**
     * Get roll numbers for students who chose a specific elective subject.
     * Uses student_electives table and joins with student_master for names.
     */
    getRollNumbersForElective(year, subjectId) {
        const db = getDb();
        return db.prepare(`
            SELECT DISTINCT se.roll_number, sm.student_name
            FROM student_electives se
            LEFT JOIN student_master sm ON sm.roll_number = se.roll_number
            WHERE se.year = ?
              AND (
                se.subject_id = ?
                OR se.subject_id IN (
                  SELECT s2.id FROM subjects s2
                  JOIN subjects s1 ON s1.id = ?
                  WHERE s1.subject_name LIKE '%(' || s2.subject_name || ')%'
                )
              )
            ORDER BY se.roll_number
        `).all(year, subjectId, subjectId);
    },

    /**
     * Get distinct years from student_master.
     */
    getStudentYears() {
        const db = getDb();
        return db.prepare(`
            SELECT DISTINCT year, COUNT(*) as student_count
            FROM student_master
            WHERE year IS NOT NULL
            GROUP BY year
            ORDER BY year
        `).all();
    }
};

module.exports = ConfigurationModel;
