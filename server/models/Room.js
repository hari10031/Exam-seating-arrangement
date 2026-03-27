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
     * @param {{ roomCode: string, rows: number, columns: number, effectiveCapacity?: number }} data
     * @returns {object} The created room
     */
    create({ roomCode, rows, columns, effectiveCapacity }) {
        const db = getDb();
        const totalCapacity = rows * columns; // benches (×2 in DOUBLE mode)
        const effCap = effectiveCapacity !== undefined && effectiveCapacity !== null
            ? effectiveCapacity
            : null;
        const stmt = db.prepare(`
      INSERT INTO rooms (room_code, total_capacity, rows, columns, effective_capacity)
      VALUES (?, ?, ?, ?, ?)
    `);
        const result = stmt.run(roomCode, totalCapacity, rows, columns, effCap);
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

    update(id, { roomCode, rows, columns, effectiveCapacity }) {
        const db = getDb();
        const totalCapacity = rows * columns;
        const effCap = effectiveCapacity !== undefined && effectiveCapacity !== null
            ? effectiveCapacity
            : null;
        db.prepare(`
      UPDATE rooms SET room_code = ?, total_capacity = ?, rows = ?, columns = ?, effective_capacity = ?
      WHERE id = ?
    `).run(roomCode, totalCapacity, rows, columns, effCap, id);
        return this.getById(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    },

    /**
     * Compute effective seat count for a room given seating mode.
     * Uses effective_capacity if set, otherwise total_capacity.
     */
    getSeatCount(room, mode) {
        const capacity = room.effective_capacity !== null && room.effective_capacity !== undefined
            ? room.effective_capacity
            : room.total_capacity;
        return mode === 'DOUBLE' ? capacity * 2 : capacity;
    },

    /**
     * Bulk create rooms from XLSX data.
     * @param {Array<{roomCode: string, rows: number, columns: number, effectiveCapacity?: number}>} rooms
     * @returns {{created: number, updated: number, errors: string[]}}
     */
    bulkImport(rooms) {
        const db = getDb();
        const results = { created: 0, updated: 0, errors: [] };

        const findByCode = db.prepare('SELECT id FROM rooms WHERE room_code = ?');
        const insert = db.prepare(`
            INSERT INTO rooms (room_code, total_capacity, rows, columns, effective_capacity)
            VALUES (?, ?, ?, ?, ?)
        `);
        const update = db.prepare(`
            UPDATE rooms SET total_capacity = ?, rows = ?, columns = ?, effective_capacity = ?
            WHERE room_code = ?
        `);

        const txn = db.transaction(() => {
            for (const room of rooms) {
                try {
                    const { roomCode, rows, columns, effectiveCapacity } = room;
                    if (!roomCode || !rows || !columns) {
                        results.errors.push(`Invalid room data: ${JSON.stringify(room)}`);
                        continue;
                    }
                    const totalCapacity = rows * columns;
                    const effCap = effectiveCapacity || null;

                    const existing = findByCode.get(roomCode);
                    if (existing) {
                        update.run(totalCapacity, rows, columns, effCap, roomCode);
                        results.updated++;
                    } else {
                        insert.run(roomCode, totalCapacity, rows, columns, effCap);
                        results.created++;
                    }
                } catch (err) {
                    results.errors.push(`Error processing room ${room.roomCode}: ${err.message}`);
                }
            }
        });

        txn();
        return results;
    }
};

module.exports = RoomModel;
