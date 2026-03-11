/**
 * BRANCHES API
 * ============
 * CRUD endpoints for academic branches.
 */
const express = require('express');
const router = express.Router();
const BranchModel = require('../models/Branch');

// GET /api/branches
router.get('/', (req, res) => {
    try {
        res.json(BranchModel.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/branches/:id
router.get('/:id', (req, res) => {
    try {
        const branch = BranchModel.getById(Number(req.params.id));
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        res.json(branch);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/branches
router.post('/', (req, res) => {
    try {
        const { branchCode, branchName, section } = req.body;
        if (!branchCode || !branchName) {
            return res.status(400).json({ error: 'branchCode and branchName are required' });
        }
        const branch = BranchModel.create({ branchCode, branchName, section });
        res.status(201).json(branch);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Branch code with this section already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/branches/:id
router.put('/:id', (req, res) => {
    try {
        const { branchCode, branchName, section } = req.body;
        const branch = BranchModel.update(Number(req.params.id), { branchCode, branchName, section });
        res.json(branch);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/branches/:id
router.delete('/:id', (req, res) => {
    try {
        BranchModel.delete(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
