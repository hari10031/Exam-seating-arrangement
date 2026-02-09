/**
 * SUBJECTS API
 * ============
 * CRUD endpoints for exam subjects.
 */
const express = require('express');
const router = express.Router();
const SubjectModel = require('../models/Subject');

// GET /api/subjects
router.get('/', (req, res) => {
    try {
        res.json(SubjectModel.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subjects/:id
router.get('/:id', (req, res) => {
    try {
        const subject = SubjectModel.getById(Number(req.params.id));
        if (!subject) return res.status(404).json({ error: 'Subject not found' });
        res.json(subject);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/subjects
router.post('/', (req, res) => {
    try {
        const { subjectCode, subjectName } = req.body;
        if (!subjectCode || !subjectName) {
            return res.status(400).json({ error: 'subjectCode and subjectName are required' });
        }
        const subject = SubjectModel.create({ subjectCode, subjectName });
        res.status(201).json(subject);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Subject code already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subjects/:id
router.put('/:id', (req, res) => {
    try {
        const { subjectCode, subjectName } = req.body;
        const subject = SubjectModel.update(Number(req.params.id), { subjectCode, subjectName });
        res.json(subject);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subjects/:id
router.delete('/:id', (req, res) => {
    try {
        SubjectModel.delete(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
