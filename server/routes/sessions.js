/**
 * EXAM SESSIONS API
 * =================
 * Full lifecycle: create session → configure rooms/branches →
 * add students → run allocation → export results.
 */
const express = require('express');
const router = express.Router();
const ExamSessionModel = require('../models/ExamSession');
const AllocationModel = require('../models/Allocation');
const ConfigurationModel = require('../models/Configuration');
const { allocateSeats, validateAllocation, buildRoomWiseSummary } = require('../engine');
const { generateExcel } = require('../export/excel');
const { generatePDF } = require('../export/pdf');
const { importXlsxToSession, generateImportTemplate } = require('../import/xlsx');

// ─── XLSX IMPORT TEMPLATE (must be before :id routes) ────────

// GET /api/sessions/import/template
router.get('/import/template', async (req, res) => {
    try {
        const buffer = await generateImportTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.xlsx"');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── SESSION CRUD ────────────────────────────────────────────

// GET /api/sessions
router.get('/', (req, res) => {
    try {
        res.json(ExamSessionModel.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id
router.get('/:id', (req, res) => {
    try {
        const details = ExamSessionModel.getFullDetails(Number(req.params.id));
        if (!details) return res.status(404).json({ error: 'Session not found' });
        res.json(details);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions
router.post('/', (req, res) => {
    try {
        const { sessionName, examDate, startTime, endTime, seatingMode, allocationMethod, year, slot } = req.body;
        if (!sessionName || !examDate) {
            return res.status(400).json({ error: 'sessionName and examDate are required' });
        }
        const session = ExamSessionModel.create({
            sessionName, examDate, startTime, endTime, seatingMode, allocationMethod, year, slot
        });

        // Auto-map branch-subjects and students from timetable
        if (year && examDate) {
            try {
                const entries = ConfigurationModel.getExamTimetableByDate(examDate, slot || null);
                const yearEntries = entries.filter(e => e.year === Number(year));
                if (yearEntries.length > 0) {
                    // Save branch-subject mappings
                    const mappings = yearEntries.map(e => ({
                        branchId: e.branch_id,
                        subjectId: e.subject_id
                    }));
                    ExamSessionModel.assignBranchSubjects(session.id, mappings);

                    // Auto-populate students from student_master
                    // For elective subjects (PE/OE), use student_electives mapping
                    // For regular subjects, use all students in the branch
                    const studentEntries = [];
                    for (const e of yearEntries) {
                        const isElective = e.subject_type === 'PE' || e.subject_type === 'OE';
                        let students;
                        if (isElective) {
                            students = ConfigurationModel.getRollNumbersForElective(Number(year), e.subject_id);
                        } else {
                            students = ConfigurationModel.getRollNumbers(Number(year), e.branch_code);
                        }
                        if (students.length > 0) {
                            studentEntries.push({
                                branchId: e.branch_id,
                                subjectId: e.subject_id,
                                rollNumbers: students.map(s => s.roll_number),
                                exclude: [],
                                include: []
                            });
                        }
                    }
                    if (studentEntries.length > 0) {
                        ExamSessionModel.setStudentsFromDb(session.id, studentEntries);
                    }
                }
            } catch (autoErr) {
                console.error('Auto-map from timetable failed (non-fatal):', autoErr.message);
            }
        }

        // Return full session details so client sees the auto-mapped data
        const fullSession = ExamSessionModel.getFullDetails(session.id);
        res.status(201).json(fullSession || session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sessions/:id
router.put('/:id', (req, res) => {
    try {
        const session = ExamSessionModel.update(Number(req.params.id), req.body);
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sessions/:id
router.delete('/:id', (req, res) => {
    try {
        ExamSessionModel.delete(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── ROOM ASSIGNMENT ─────────────────────────────────────────

// PUT /api/sessions/:id/rooms
router.put('/:id/rooms', (req, res) => {
    try {
        const { roomIds } = req.body;
        if (!Array.isArray(roomIds)) {
            return res.status(400).json({ error: 'roomIds must be an array' });
        }
        ExamSessionModel.assignRooms(Number(req.params.id), roomIds);
        const rooms = ExamSessionModel.getRooms(Number(req.params.id));
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id/rooms
router.get('/:id/rooms', (req, res) => {
    try {
        res.json(ExamSessionModel.getRooms(Number(req.params.id)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── BRANCH-SUBJECT MAPPING ─────────────────────────────────

// PUT /api/sessions/:id/branch-subjects
router.put('/:id/branch-subjects', (req, res) => {
    try {
        const { mappings } = req.body;
        if (!Array.isArray(mappings)) {
            return res.status(400).json({ error: 'mappings must be an array of {branchId, subjectId}' });
        }
        ExamSessionModel.assignBranchSubjects(Number(req.params.id), mappings);
        res.json(ExamSessionModel.getBranchSubjects(Number(req.params.id)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id/branch-subjects
router.get('/:id/branch-subjects', (req, res) => {
    try {
        res.json(ExamSessionModel.getBranchSubjects(Number(req.params.id)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── STUDENTS ────────────────────────────────────────────────

// PUT /api/sessions/:id/students
// Body: { entries: [{ branchId, subjectId, ranges: [{start, end}], exclude: [], include: [] }] }
router.put('/:id/students', (req, res) => {
    try {
        const { entries } = req.body;
        if (!Array.isArray(entries)) {
            return res.status(400).json({ error: 'entries must be an array' });
        }
        ExamSessionModel.setStudents(Number(req.params.id), entries);
        const students = ExamSessionModel.getStudents(Number(req.params.id));
        res.json({ count: students.length, students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sessions/:id/students-from-db
// Body: { entries: [{ branchId, subjectId, rollNumbers: [...], exclude: [], include: [] }] }
router.put('/:id/students-from-db', (req, res) => {
    try {
        const { entries } = req.body;
        if (!Array.isArray(entries)) {
            return res.status(400).json({ error: 'entries must be an array' });
        }
        ExamSessionModel.setStudentsFromDb(Number(req.params.id), entries);
        const students = ExamSessionModel.getStudents(Number(req.params.id));
        res.json({ count: students.length, students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id/students
router.get('/:id/students', (req, res) => {
    try {
        const students = ExamSessionModel.getStudents(Number(req.params.id));
        res.json({ count: students.length, students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/students/preview
// Preview roll expansion without saving
router.post('/:id/students/preview', (req, res) => {
    try {
        const { ranges, exclude, include } = req.body;
        const { expandRolls } = require('../models/ExamSession');
        // ranges can be [{start: "2451-23-733-001", end: "2451-23-733-020"}] or [{start: 101, end: 130}]
        const rolls = expandRolls(ranges || [], exclude || [], include || []);
        res.json({ count: rolls.length, rolls });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── ALLOCATION ─────────────────────────────────────────────

// POST /api/sessions/:id/allocate
router.post('/:id/allocate', (req, res) => {
    try {
        const sessionId = Number(req.params.id);
        const session = ExamSessionModel.getById(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const rooms = ExamSessionModel.getRooms(sessionId);
        const students = ExamSessionModel.getStudents(sessionId);

        if (rooms.length === 0) {
            return res.status(400).json({ error: 'No rooms assigned to this session' });
        }
        if (students.length === 0) {
            return res.status(400).json({ error: 'No students in this session' });
        }

        // Run allocation engine
        const { allocations, report } = allocateSeats({
            rooms,
            students,
            mode: session.seating_mode,
            allocationMethod: session.allocation_method || 'INTERLEAVED'
        });

        // Validate
        const validation = validateAllocation({
            allocations,
            students,
            report,
            mode: session.seating_mode,
            rooms,
            allocationMethod: session.allocation_method || 'INTERLEAVED'
        });

        // Persist
        AllocationModel.saveAllocations(sessionId, allocations);
        AllocationModel.saveReport(sessionId, report);
        ExamSessionModel.update(sessionId, { status: 'ALLOCATED' });

        res.json({
            success: validation.valid,
            report,
            validation,
            allocationCount: allocations.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── VIEW ALLOCATION ─────────────────────────────────────────

// GET /api/sessions/:id/allocations
router.get('/:id/allocations', (req, res) => {
    try {
        const sessionId = Number(req.params.id);
        const grouped = AllocationModel.getBySessionGrouped(sessionId);
        const report = AllocationModel.getReport(sessionId);
        res.json({ rooms: grouped, report });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id/allocations/grid/:roomId
router.get('/:id/allocations/grid/:roomId', (req, res) => {
    try {
        const grid = AllocationModel.getRoomGrid(Number(req.params.id), Number(req.params.roomId));
        if (!grid) return res.status(404).json({ error: 'Room grid not found' });
        res.json(grid);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── EXPORT ──────────────────────────────────────────────────

// GET /api/sessions/:id/export/excel
router.get('/:id/export/excel', async (req, res) => {
    try {
        const sessionId = Number(req.params.id);
        const session = ExamSessionModel.getById(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const allocations = AllocationModel.getBySession(sessionId);
        const rooms = ExamSessionModel.getRooms(sessionId);
        const report = AllocationModel.getReport(sessionId) || {
            totalStudents: 0, totalSeats: 0, assignedCount: 0, unassignedCount: 0, unassignedReasons: []
        };

        // Build room grids
        const roomGrids = rooms.map(r => AllocationModel.getRoomGrid(sessionId, r.id)).filter(Boolean);

        // Build room-wise summary for the summary table
        const roomSummary = buildRoomWiseSummary(allocations, rooms);

        const buffer = await generateExcel({
            sessionName: session.session_name,
            allocations,
            roomGrids,
            report,
            roomSummary,
            sessionInfo: {
                examDate: session.exam_date || '',
                startTime: session.start_time || '',
                endTime: session.end_time || '',
                slot: session.slot || '',
                year: session.year || ''
            }
        });

        const safeNameXls = session.session_name.replace(/[^a-zA-Z0-9_-]/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="seating-${safeNameXls}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id/export/pdf
router.get('/:id/export/pdf', async (req, res) => {
    try {
        const sessionId = Number(req.params.id);
        const session = ExamSessionModel.getById(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const rooms = ExamSessionModel.getRooms(sessionId);
        const report = AllocationModel.getReport(sessionId) || {
            totalStudents: 0, totalSeats: 0, assignedCount: 0, unassignedCount: 0, unassignedReasons: []
        };
        const roomGrids = rooms.map(r => AllocationModel.getRoomGrid(sessionId, r.id)).filter(Boolean);

        // Build room-wise summary for the summary pages
        const allocations = AllocationModel.getBySession(sessionId);
        const roomSummary = buildRoomWiseSummary(allocations, rooms);

        const buffer = await generatePDF({
            sessionName: session.session_name,
            mode: session.seating_mode,
            roomGrids,
            report,
            roomSummary
        });

        const safeNamePdf = session.session_name.replace(/[^a-zA-Z0-9_-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="seating-${safeNamePdf}.pdf"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── VALIDATION REPORT ───────────────────────────────────────

// GET /api/sessions/:id/report
router.get('/:id/report', (req, res) => {
    try {
        const report = AllocationModel.getReport(Number(req.params.id));
        if (!report) return res.status(404).json({ error: 'No allocation report found' });
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── XLSX IMPORT ─────────────────────────────────────────────

// POST /api/sessions/:id/students/import
// Import students from XLSX file (send as base64 in JSON body)
// Body: { 
//   fileData: "base64-encoded-xlsx",
//   createMissingBranches: false,
//   defaultSubjectId: null,
//   branchSubjectMap: { "CSE": 1, "CSIT": 2 }  // optional
// }
router.post('/:id/students/import', async (req, res) => {
    try {
        const sessionId = Number(req.params.id);
        const session = ExamSessionModel.getById(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const { fileData, createMissingBranches, defaultSubjectId, branchSubjectMap } = req.body;

        if (!fileData) {
            return res.status(400).json({ error: 'fileData (base64-encoded XLSX) is required' });
        }

        // Decode base64 to buffer
        const buffer = Buffer.from(fileData, 'base64');

        const result = await importXlsxToSession(sessionId, buffer, {
            createMissingBranches: createMissingBranches || false,
            defaultSubjectId: defaultSubjectId || null,
            branchSubjectMap: branchSubjectMap || {}
        });

        // Return updated student count along with import results
        const students = ExamSessionModel.getStudents(sessionId);

        res.json({
            success: result.imported > 0,
            imported: result.imported,
            skipped: result.skipped,
            totalInFile: result.totalInFile,
            totalInSession: students.length,
            errors: result.errors,
            createdBranches: result.createdBranches
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
