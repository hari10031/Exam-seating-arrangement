/**
 * BRANCH MODEL
 * ============
 * CRUD for academic branches (CSE, CSIT, CSE AI/ML, etc.)
 * Each branch can have a section (A, B, C...) for separate allocation groups.
 */
const { getDb } = require('../db/connection');

const BranchModel = {
    create({ branchCode, branchName, section }) {
        const db = getDb();
        const stmt = db.prepare(`
      INSERT INTO branches (branch_code, branch_name, section) VALUES (?, ?, ?)
    `);
        const result = stmt.run(branchCode, branchName, section || '');
        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
    },

    getByCode(branchCode, section) {
        const db = getDb();
        if (section !== undefined && section !== null) {
            return db.prepare('SELECT * FROM branches WHERE branch_code = ? AND section = ?').get(branchCode, section);
        }
        return db.prepare('SELECT * FROM branches WHERE branch_code = ?').get(branchCode);
    },

    getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM branches ORDER BY branch_code, section').all();
    },

    update(id, { branchCode, branchName, section }) {
        const db = getDb();
        db.prepare('UPDATE branches SET branch_code = ?, branch_name = ?, section = ? WHERE id = ?')
            .run(branchCode, branchName, section || '', id);
        return this.getById(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM branches WHERE id = ?').run(id);
    }
};

module.exports = BranchModel;
