/**
 * ROOMS API
 * =========
 * CRUD endpoints for exam rooms.
 */
const express = require('express');
const router = express.Router();
const RoomModel = require('../models/Room');

// GET /api/rooms
router.get('/', (req, res) => {
    try {
        const rooms = RoomModel.getAll();
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/rooms/:id
router.get('/:id', (req, res) => {
    try {
        const room = RoomModel.getById(Number(req.params.id));
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rooms
router.post('/', (req, res) => {
    try {
        const { roomCode, rows, columns } = req.body;
        if (!roomCode || !rows || !columns) {
            return res.status(400).json({ error: 'roomCode, rows, and columns are required' });
        }
        const room = RoomModel.create({ roomCode, rows: Number(rows), columns: Number(columns) });
        res.status(201).json(room);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Room code already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/rooms/:id
router.put('/:id', (req, res) => {
    try {
        const { roomCode, rows, columns } = req.body;
        const room = RoomModel.update(Number(req.params.id), {
            roomCode, rows: Number(rows), columns: Number(columns)
        });
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/rooms/:id
router.delete('/:id', (req, res) => {
    try {
        RoomModel.delete(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
