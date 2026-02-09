/**
 * SUBJECT MODEL
 * =============
 * CRUD operations for exam subjects.
 */
const { getDb } = require('../db/connection');

const SubjectModel = {
    create({ subjectCode, subjectName }) {
        const db = getDb();
        const stmt = db.prepare(`
      INSERT INTO subjects (subject_code, subject_name) VALUES (?, ?)
    `);
        const result = stmt.run(subjectCode, subjectName);
        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
    },

    getByCode(subjectCode) {
        const db = getDb();
        return db.prepare('SELECT * FROM subjects WHERE subject_code = ?').get(subjectCode);
    },

    getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM subjects ORDER BY subject_code').all();
    },

    update(id, { subjectCode, subjectName }) {
        const db = getDb();
        db.prepare('UPDATE subjects SET subject_code = ?, subject_name = ? WHERE id = ?')
            .run(subjectCode, subjectName, id);
        return this.getById(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
    }
};

module.exports = SubjectModel;
