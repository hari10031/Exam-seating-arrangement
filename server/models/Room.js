/**
 * ROOM MODEL
 * ==========
 * CRUD operations for exam rooms.
 * Each room has rows × columns benches.
 */
const { getDb } = require('../db/connection');

const RoomModel = {
    /**
     * Create a new room.
     * @param {{ roomCode: string, rows: number, columns: number }} data
     * @returns {object} The created room
     */
    create({ roomCode, rows, columns }) {
        const db = getDb();
        const totalCapacity = rows * columns; // benches (×2 in DOUBLE mode)
        const stmt = db.prepare(`
      INSERT INTO rooms (room_code, total_capacity, rows, columns)
      VALUES (?, ?, ?, ?)
    `);
        const result = stmt.run(roomCode, totalCapacity, rows, columns);
        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    },

    getByCode(roomCode) {
        const db = getDb();
        return db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode);
    },

    getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM rooms ORDER BY room_code').all();
    },

    update(id, { roomCode, rows, columns }) {
        const db = getDb();
        const totalCapacity = rows * columns;
        db.prepare(`
      UPDATE rooms SET room_code = ?, total_capacity = ?, rows = ?, columns = ?
      WHERE id = ?
    `).run(roomCode, totalCapacity, rows, columns, id);
        return this.getById(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    },

    /**
     * Compute effective seat count for a room given seating mode.
     */
    getSeatCount(room, mode) {
        const benchCount = room.rows * room.columns;
        return mode === 'DOUBLE' ? benchCount * 2 : benchCount;
    }
};

module.exports = RoomModel;
