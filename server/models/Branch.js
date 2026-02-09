/**
 * BRANCH MODEL
 * ============
 * CRUD for academic branches (CSE, CSIT, CSE AI/ML, etc.)
 */
const { getDb } = require('../db/connection');

const BranchModel = {
    create({ branchCode, branchName }) {
        const db = getDb();
        const stmt = db.prepare(`
      INSERT INTO branches (branch_code, branch_name) VALUES (?, ?)
    `);
        const result = stmt.run(branchCode, branchName);
        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
    },

    getByCode(branchCode) {
        const db = getDb();
        return db.prepare('SELECT * FROM branches WHERE branch_code = ?').get(branchCode);
    },

    getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM branches ORDER BY branch_code').all();
    },

    update(id, { branchCode, branchName }) {
        const db = getDb();
        db.prepare('UPDATE branches SET branch_code = ?, branch_name = ? WHERE id = ?')
            .run(branchCode, branchName, id);
        return this.getById(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM branches WHERE id = ?').run(id);
    }
};

module.exports = BranchModel;
