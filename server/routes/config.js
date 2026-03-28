/**
 * CONFIGURATION API
 * =================
 * Manages all data configuration:
 *  - Student XLSX import (with column picker)
 *  - Year → Branch → Subject mapping (from XLSX)
 *  - Student elective choices (from XLSX)
 *  - Exam timetable (from XLSX)
 */
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { getDb } = require('../db/connection');
const ConfigurationModel = require('../models/Configuration');
const BranchModel = require('../models/Branch');
const SubjectModel = require('../models/Subject');
const RoomModel = require('../models/Room');

// ═══════════════════════════════════════════════════════════════
//  XLSX COLUMN DETECTION — Reads headers for user to pick columns
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/config/xlsx/detect-columns
 * Body: { fileData: "base64-encoded-xlsx" }
 * Returns: { sheets: [{ name, headers: [{col, name}], sampleRows: [[...], ...] }] }
 */
router.post('/xlsx/detect-columns', async (req, res) => {
    try {
        const { fileData } = req.body;
        if (!fileData) return res.status(400).json({ error: 'fileData (base64) is required' });

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // Known header keywords for smart detection
        const KNOWN_HEADERS = [
            'roll', 'htno', 'hall ticket', 'branch', 'name of the student',
            'student name', 'subject code', 'sub code', 'subject name',
            'date', 'exam date', 'slot', 'section', 'year', 'sem',
            's.no', 's.no.', 'sno', 'sl.no'
        ];

        const sheets = [];
        for (const worksheet of workbook.worksheets) {
            const headers = [];
            const sampleRows = [];

            // Try to find header row in first 20 rows
            // Strategy: prefer a row that matches known header keywords, else
            // fall back to first row with 2+ non-empty short cells
            let headerRowNum = -1;
            let fallbackRow = -1;
            for (let r = 1; r <= Math.min(20, worksheet.rowCount); r++) {
                const row = worksheet.getRow(r);
                const cells = [];
                let hasText = false;
                let knownMatchCount = 0;
                row.eachCell((cell, colNum) => {
                    const val = String(cell.value || '').trim();
                    cells.push({ col: colNum, name: val });
                    if (val.length > 0 && val.length < 100) hasText = true;
                    // Check if this cell matches known headers
                    const lower = val.toLowerCase();
                    for (const kw of KNOWN_HEADERS) {
                        if (lower.includes(kw) || lower === kw) {
                            knownMatchCount++;
                            break;
                        }
                    }
                });
                // Prefer row with 2+ known header matches
                if (knownMatchCount >= 2 && headerRowNum === -1) {
                    headerRowNum = r;
                }
                // Fallback: first row with 2+ non-empty cells
                if (hasText && cells.length >= 2 && fallbackRow === -1) {
                    fallbackRow = r;
                }
            }

            if (headerRowNum === -1) headerRowNum = fallbackRow !== -1 ? fallbackRow : 1;

            // Extract headers from detected header row
            const headerRow = worksheet.getRow(headerRowNum);
            headerRow.eachCell((cell, colNum) => {
                headers.push({ col: colNum, name: String(cell.value || '').trim() });
            });

            // Get up to 5 sample data rows after header
            for (let r = headerRowNum + 1; r <= Math.min(headerRowNum + 5, worksheet.rowCount); r++) {
                const row = worksheet.getRow(r);
                const rowData = {};
                headers.forEach(h => {
                    rowData[h.col] = String(row.getCell(h.col).value || '').trim();
                });
                sampleRows.push(rowData);
            }

            sheets.push({
                name: worksheet.name,
                headerRow: headerRowNum,
                headers,
                sampleRows
            });
        }

        res.json({ sheets });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  STUDENT MASTER — XLSX Import with column selection
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/config/students/import
 * Body: {
 *   fileData: "base64",
 *   yearMapping: { "22": 4, "23": 3, "24": 2 },   // admission code -> academic year
 *   columnMapping: { rollNumber: 3, studentName: 5, branch: 7 },
 *   sheetName: "Sheet1",    // optional, defaults to first/all sheets
 *   headerRow: 5,           // optional, auto-detected
 *   createMissingBranches: true
 * }
 */
router.post('/students/import', async (req, res) => {
    try {
        const { fileData, yearMapping, year, columnMapping, sheetName, sheetNames, headerRow, createMissingBranches } = req.body;
        if (!fileData) return res.status(400).json({ error: 'fileData is required' });
        if (!yearMapping && !year) return res.status(400).json({ error: 'yearMapping or year is required' });
        if (!columnMapping || !columnMapping.rollNumber) {
            return res.status(400).json({ error: 'columnMapping with at least rollNumber is required' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const db = getDb();
        const result = { imported: 0, skipped: 0, errors: [], createdBranches: [], yearBreakdown: {} };

        // Get branch lookup
        const branches = BranchModel.getAll();
        const branchLookup = {};
        for (const b of branches) {
            branchLookup[b.branch_code.toUpperCase()] = b;
            branchLookup[b.branch_name.toUpperCase()] = b;
        }

        const upsert = db.prepare(`
            INSERT INTO student_master (roll_number, student_name, branch_code, section, year, source_file)
            VALUES (?, ?, ?, ?, ?, 'xlsx-import')
            ON CONFLICT(roll_number) DO UPDATE SET
                student_name = excluded.student_name,
                branch_code = excluded.branch_code,
                section = excluded.section,
                year = excluded.year
        `);

        // Helper: extract admission year code from roll number (e.g. "2451-22-733-001" -> "22")
        const extractAdmCode = (rollNumber) => {
            const parts = String(rollNumber || '').trim().split('-');
            if (parts.length >= 2 && /^\d{2}$/.test(parts[1])) return parts[1];
            return null;
        };

        const processSheet = (worksheet, detectedHeaderRow) => {
            const startRow = detectedHeaderRow || headerRow || 1;

            worksheet.eachRow((row, rowNum) => {
                if (rowNum <= startRow) return;

                const rollNumber = String(row.getCell(columnMapping.rollNumber).value || '').trim();
                const studentName = columnMapping.studentName
                    ? String(row.getCell(columnMapping.studentName).value || '').trim() : null;
                const branchRaw = columnMapping.branch
                    ? String(row.getCell(columnMapping.branch).value || '').trim() : null;
                const sectionRaw = columnMapping.section
                    ? String(row.getCell(columnMapping.section).value || '').trim() : '';

                // Validate roll number
                if (!rollNumber || rollNumber.length < 3 || !/\d/.test(rollNumber)) return;
                // Skip section headers / title rows (contain words like Sem, Section, Starts, etc.)
                if (/\b(sem|semester|section|starts|ends|batch|year|from|to)\b/i.test(rollNumber)) return;

                // Determine academic year from yearMapping or fallback to year param
                let academicYear;
                if (yearMapping) {
                    const code = extractAdmCode(rollNumber);
                    if (!code) return; // silently skip rows without valid roll number format
                    if (!yearMapping[code]) {
                        // Skip students whose admission code isn't mapped
                        result.skipped++;
                        result.errors.push({ rollNumber, reason: `Admission year code "${code}" not mapped` });
                        return;
                    }
                    academicYear = Number(yearMapping[code]);
                } else {
                    academicYear = Number(year);
                }

                // Handle branch — create section-specific branch only
                // (If no section provided, creates a branch with empty section)
                let branchCode = branchRaw;
                if (branchRaw && createMissingBranches) {
                    // Create branch with the specified section (or empty if not provided)
                    const secKey = sectionRaw 
                        ? `${branchRaw.toUpperCase()}::${sectionRaw.toUpperCase()}`
                        : branchRaw.toUpperCase();
                    
                    if (!branchLookup[secKey]) {
                        try {
                            const newBranch = BranchModel.create({
                                branchCode: branchRaw,
                                branchName: branchRaw,
                                section: sectionRaw || ''
                            });
                            branchLookup[secKey] = newBranch;
                            result.createdBranches.push(sectionRaw ? `${branchRaw}-${sectionRaw}` : branchRaw);
                        } catch (_) {
                            // May already exist — look it up
                            const existing = BranchModel.getByCode(branchRaw, sectionRaw || '');
                            if (existing) branchLookup[secKey] = existing;
                        }
                    }
                }

                try {
                    upsert.run(rollNumber, studentName, branchCode, sectionRaw, academicYear);
                    result.imported++;
                    // Track year breakdown
                    result.yearBreakdown[academicYear] = (result.yearBreakdown[academicYear] || 0) + 1;
                } catch (err) {
                    result.skipped++;
                    result.errors.push({ rollNumber, reason: err.message });
                }
            });
        };

        const txn = db.transaction(() => {
            if (sheetNames && sheetNames.length > 0) {
                for (const sn of sheetNames) {
                    const ws = workbook.getWorksheet(sn);
                    if (ws) processSheet(ws, headerRow);
                }
            } else if (sheetName) {
                const ws = workbook.getWorksheet(sheetName);
                if (!ws) throw new Error(`Sheet "${sheetName}" not found`);
                processSheet(ws, headerRow);
            } else {
                for (const ws of workbook.worksheets) {
                    processSheet(ws, headerRow);
                }
            }
        });
        txn();

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/students?year=2&branch=CSE  or  ?year=2&branchId=3
 *   or  ?year=2&subjectId=5  (for elective students only)
 * Get students from student_master, filtered by year and optionally branch.
 * When subjectId is provided, returns only students who chose that elective.
 *
 * Response format:
 *   - Array of students (backward compatible)
 *   - OR { students: [], meta: { ... } } when enhanced=true
 */
router.get('/students', (req, res) => {
    try {
        const { year, branch, branchId, subjectId, enhanced } = req.query;

        const db = getDb();

        let branchCode = branch;
        let section;
        if (!branchCode && branchId) {
            const row = db.prepare('SELECT branch_code, section FROM branches WHERE id = ?').get(Number(branchId));
            branchCode = row ? row.branch_code : null;
            section = row ? row.section : undefined;
        }

        // If subjectId provided, return only students who chose that elective.
        // When branch/branchId is provided, scope results to that branch+section.
        if (year && subjectId) {
            const students = ConfigurationModel.getRollNumbersForElective(
                Number(year),
                Number(subjectId),
                branchCode || null,
                section
            );

            // Enhanced mode: provide metadata about why list might be empty
            if (enhanced === 'true' && students.length === 0 && branchCode) {
                // Check if branch has students in student_master
                const masterCount = db.prepare(
                    'SELECT COUNT(*) as cnt FROM student_master WHERE year = ? AND UPPER(branch_code) = UPPER(?)'
                ).get(Number(year), branchCode);

                // Check if branch has any elective choices
                const electiveCount = db.prepare(`
                    SELECT COUNT(*) as cnt FROM student_electives se
                    JOIN student_master sm ON sm.roll_number = se.roll_number
                    WHERE se.year = ? AND UPPER(sm.branch_code) = UPPER(?)
                `).get(Number(year), branchCode);

                // Get subject name for better messaging
                const subject = db.prepare('SELECT subject_name FROM subjects WHERE id = ?').get(Number(subjectId));

                res.json({
                    students: [],
                    meta: {
                        hasStudentMaster: masterCount.cnt > 0,
                        studentMasterCount: masterCount.cnt,
                        hasElectiveChoices: electiveCount.cnt > 0,
                        electiveChoicesCount: electiveCount.cnt,
                        subjectName: subject?.subject_name || '',
                        reason: masterCount.cnt === 0
                            ? 'no_student_master'
                            : electiveCount.cnt === 0
                                ? 'no_elective_imports'
                                : 'no_match'
                    }
                });
                return;
            }

            res.json(students);
            return;
        }

        if (year && branchCode) {
            res.json(ConfigurationModel.getRollNumbers(Number(year), branchCode, section));
        } else if (year) {
            res.json(ConfigurationModel.getStudentsByYear(Number(year)));
        } else {
            // Return summary by year
            res.json(ConfigurationModel.getStudentYears());
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/students/branches?year=2
 * Get distinct branches from student_master for a year.
 */
router.get('/students/branches', (req, res) => {
    try {
        const { year } = req.query;
        if (!year) return res.status(400).json({ error: 'year is required' });
        res.json(ConfigurationModel.getStudentBranchesForYear(Number(year)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/students/years
 * Get distinct years from student_master.
 */
router.get('/students/years', (req, res) => {
    try {
        res.json(ConfigurationModel.getStudentYears());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  YEAR → BRANCH → SUBJECT MAPPING
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/config/year-subjects/import
 * Import subject mapping from XLSX.
 * Body: {
 *   fileData: "base64",
 *   year: 2,                  // optional if yearColumn is mapped
 *   columnMapping: { branch: 1, subjectCode: 2, subjectName: 3, year: 4 },
 *   sheetName: "Sheet1",      // single sheet
 *   sheetNames: ["S1","S2"],  // OR multiple sheets
 *   headerRow: 1,
 *   autoDetectType: true,
 *   createMissing: true
 * }
 */
router.post('/year-subjects/import', async (req, res) => {
    try {
        const { fileData, year, columnMapping, sheetName, sheetNames, headerRow, autoDetectType, createMissing } = req.body;
        if (!fileData) return res.status(400).json({ error: 'fileData is required' });
        if (!columnMapping || !columnMapping.branch || (!columnMapping.subjectCode && !columnMapping.subjectName)) {
            return res.status(400).json({ error: 'columnMapping with branch and at least one of subjectCode or subjectName is required' });
        }
        const hasYearColumn = !!columnMapping.year;
        const hasSubjectCodeCol = !!columnMapping.subjectCode;
        const hasSubjectNameCol = !!columnMapping.subjectName;
        if (!hasYearColumn && !year) {
            return res.status(400).json({ error: 'year is required (or map a Year column)' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const db = getDb();
        const result = { imported: 0, skipped: 0, errors: [], createdSubjects: [], createdBranches: [], yearBreakdown: {} };

        // Map branch_code → array of all branch rows (one per section)
        const branchLookup = {};
        BranchModel.getAll().forEach(b => {
            const key = b.branch_code.toUpperCase();
            if (!branchLookup[key]) branchLookup[key] = [];
            branchLookup[key].push(b);
        });

        const subjectLookup = {};
        const subjectNameLookup = {};
        const subjectNormalizedLookup = {};  // normalized code (strip dots/spaces/hyphens)
        const subjectNormalizedNameLookup = {};  // normalized name (PE/OE abbreviations)
        const normalizeCode = (code) => code.replace(/[.\s\-_]/g, '').toUpperCase();
        const normalizeName = (name) => {
            return name
                .replace(/professional\s+elective/gi, 'PE')
                .replace(/open\s+elective/gi, 'OE')
                .replace(/[^a-zA-Z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toUpperCase();
        };
        SubjectModel.getAll().forEach(s => {
            subjectLookup[s.subject_code.toUpperCase()] = s;
            subjectNormalizedLookup[normalizeCode(s.subject_code)] = s;
            if (s.subject_name) {
                subjectNameLookup[s.subject_name.toUpperCase()] = s;
                subjectNormalizedNameLookup[normalizeName(s.subject_name)] = s;
            }
        });

        // Auto-detect subject type from name
        const detectType = (subjectName, subjectCode) => {
            const name = (subjectName || subjectCode || '').toLowerCase();
            if (name.includes('professional elective') || /\bpe\b/.test(name) || /\bpe[-\s]?\d/.test(name)) return 'PE';
            if (name.includes('open elective') || /\boe\b/.test(name) || /\boe[-\s]?\d/.test(name)) return 'OE';
            return 'REGULAR';
        };

        // Helper: generate a short subject code from a name
        // e.g. "Automata Languages and computation" -> "AUT-LAN-COM"
        const generateSubjectCode = (name) => {
            const words = name.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);
            const skip = new Set(['and', 'of', 'the', 'in', 'for', 'to', 'a', 'an', 'on', 'with', 'is', 'at', 'by']);
            const significant = words.filter(w => !skip.has(w.toLowerCase()));
            if (significant.length === 0) return name.substring(0, 20).toUpperCase().replace(/\s+/g, '-');
            if (significant.length <= 3) {
                return significant.map(w => w.substring(0, 4).toUpperCase()).join('-');
            }
            return significant.map(w => w.substring(0, 3).toUpperCase()).join('-');
        };

        // Group mappings by year with deduplication tracking
        const mappingsByYear = {};
        const seenMappings = new Set(); // Track (year, branchId, subjectId) to prevent duplicates

        const processSheet = (worksheet) => {
            const startRow = headerRow || 1;
            worksheet.eachRow((row, rowNum) => {
                if (rowNum <= startRow) return;

                const branchRaw = String(row.getCell(columnMapping.branch).value || '').trim();

                // Read subject code and name based on what columns are mapped
                let subjectCode, subjectName;
                if (hasSubjectCodeCol && hasSubjectNameCol) {
                    subjectCode = String(row.getCell(columnMapping.subjectCode).value || '').trim();
                    subjectName = String(row.getCell(columnMapping.subjectName).value || '').trim();
                } else if (hasSubjectCodeCol) {
                    subjectCode = String(row.getCell(columnMapping.subjectCode).value || '').trim();
                    subjectName = subjectCode;
                } else {
                    // Only subjectName column mapped - auto-generate code from name
                    subjectName = String(row.getCell(columnMapping.subjectName).value || '').trim();
                    subjectCode = subjectName ? generateSubjectCode(subjectName) : '';
                }

                // Determine year: from column or from request body
                let rowYear;
                if (hasYearColumn) {
                    const yVal = row.getCell(columnMapping.year).value;
                    rowYear = Number(yVal);
                    if (!rowYear || rowYear < 1 || rowYear > 6) return; // skip invalid year rows
                } else {
                    rowYear = Number(year);
                }

                // Determine subject type
                let subjectType;
                if (autoDetectType) {
                    subjectType = detectType(subjectName, subjectCode);
                } else if (columnMapping.subjectType) {
                    subjectType = String(row.getCell(columnMapping.subjectType).value || '').trim().toUpperCase();
                } else {
                    subjectType = 'REGULAR';
                }

                if (!branchRaw || (!subjectCode && !subjectName)) return;

                // Resolve or create branch — get ALL sections for this branch_code
                let branches = branchLookup[branchRaw.toUpperCase()];
                if ((!branches || branches.length === 0) && createMissing) {
                    try {
                        const newBranch = BranchModel.create({ branchCode: branchRaw, branchName: branchRaw });
                        branchLookup[branchRaw.toUpperCase()] = [newBranch];
                        branches = [newBranch];
                        result.createdBranches.push(branchRaw);
                    } catch (_) {
                        const existing = BranchModel.getByCode(branchRaw);
                        if (existing) branches = [existing];
                    }
                }
                if (!branches || branches.length === 0) {
                    result.skipped++;
                    result.errors.push({ subjectCode, reason: `Unknown branch: ${branchRaw}` });
                    return;
                }

                // Resolve or create subject — use subject NAME as primary key
                // This prevents collapsing different subjects that share the same code (e.g. semester)
                let subject = null;
                const nameKey = subjectName ? subjectName.toUpperCase() : '';
                const codeKey = subjectCode ? subjectCode.toUpperCase() : '';

                // 1. Look up by exact name first (most reliable for deduplication)
                if (nameKey) {
                    subject = subjectNameLookup[nameKey];
                }
                // 2. Try exact code match
                if (!subject && codeKey) {
                    subject = subjectLookup[codeKey];
                }
                // 3. Try normalized code match (strip dots, spaces, hyphens)
                if (!subject && codeKey) {
                    subject = subjectNormalizedLookup[normalizeCode(codeKey)];
                }
                // 4. Try normalized name match (PE/OE abbreviations, strip special chars)
                if (!subject && nameKey) {
                    subject = subjectNormalizedNameLookup[normalizeName(subjectName)];
                }
                // 5. Create if missing
                if (!subject && createMissing) {
                    // Generate a unique code from the name to avoid code collisions
                    let newCode = codeKey && !subjectLookup[codeKey] ? subjectCode : generateSubjectCode(subjectName || subjectCode);
                    // Ensure code uniqueness by appending counter if needed
                    let baseCode = newCode;
                    let counter = 2;
                    while (subjectLookup[newCode.toUpperCase()]) {
                        newCode = baseCode + '-' + counter;
                        counter++;
                    }
                    try {
                        const finalName = subjectName || subjectCode;
                        subject = SubjectModel.create({ subjectCode: newCode, subjectName: finalName });
                        subjectLookup[newCode.toUpperCase()] = subject;
                        subjectNormalizedLookup[normalizeCode(newCode)] = subject;
                        if (finalName) {
                            subjectNameLookup[finalName.toUpperCase()] = subject;
                            subjectNormalizedNameLookup[normalizeName(finalName)] = subject;
                        }
                        result.createdSubjects.push(newCode);
                    } catch (_) {
                        // Race condition fallback
                        if (nameKey) subject = SubjectModel.getByName(subjectName);
                        if (!subject && codeKey) subject = SubjectModel.getByCode(subjectCode);
                    }
                }
                if (!subject) {
                    result.skipped++;
                    result.errors.push({ subjectCode: subjectCode || subjectName, reason: `Unknown subject: ${subjectName || subjectCode}` });
                    return;
                }

                const validType = ['REGULAR', 'PE', 'OE'].includes(subjectType) ? subjectType : 'REGULAR';
                if (!mappingsByYear[rowYear]) mappingsByYear[rowYear] = [];
                
                // Create mapping for ALL sections of this branch
                // (e.g., if CIC has sections A, B, C, D - create mapping for each)
                for (const branch of branches) {
                    const mappingKey = `${rowYear}-${branch.id}-${subject.id}`;
                    
                    // Only add if this exact (year, branch, subject) combination hasn't been seen
                    if (!seenMappings.has(mappingKey)) {
                        seenMappings.add(mappingKey);
                        mappingsByYear[rowYear].push({ branchId: branch.id, subjectId: subject.id, subjectType: validType });
                    }
                }
                result.imported++;
                result.yearBreakdown[rowYear] = (result.yearBreakdown[rowYear] || 0) + 1;
            });
        };

        if (sheetNames && sheetNames.length > 0) {
            for (const sn of sheetNames) {
                const ws = workbook.getWorksheet(sn);
                if (ws) processSheet(ws);
            }
        } else if (sheetName) {
            const ws = workbook.getWorksheet(sheetName);
            if (!ws) throw new Error(`Sheet "${sheetName}" not found`);
            processSheet(ws);
        } else {
            for (const ws of workbook.worksheets) {
                processSheet(ws);
            }
        }

        // Save: for each year, clear existing then set new
        for (const [yr, maps] of Object.entries(mappingsByYear)) {
            ConfigurationModel.setYearBranchSubjects(Number(yr), maps);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/config/year-subjects/:year
 * Manually set subject mappings for a year.
 * Body: { mappings: [{ branchId, subjectId, subjectType }] }
 */
router.put('/year-subjects/:year', (req, res) => {
    try {
        const year = Number(req.params.year);
        const { mappings } = req.body;
        if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings array is required' });

        ConfigurationModel.setYearBranchSubjects(year, mappings);
        res.json(ConfigurationModel.getYearBranchSubjects(year));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/year-subjects/:year
 * Get subject mappings for a year, optionally filtered by branchId.
 */
router.get('/year-subjects/:year', (req, res) => {
    try {
        const year = Number(req.params.year);
        const branchId = req.query.branchId ? Number(req.query.branchId) : null;
        res.json(ConfigurationModel.getYearBranchSubjects(year, branchId));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/year-subjects
 * Get all year-subject mappings.
 */
router.get('/year-subjects', (req, res) => {
    try {
        res.json(ConfigurationModel.getAllYearBranchSubjects());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/config/year-subjects/:year
 */
router.delete('/year-subjects/:year', (req, res) => {
    try {
        ConfigurationModel.deleteYearMappings(Number(req.params.year));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/years
 * Get configured years.
 */
router.get('/years', (req, res) => {
    try {
        res.json(ConfigurationModel.getConfiguredYears());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/branches-for-year/:year
 */
router.get('/branches-for-year/:year', (req, res) => {
    try {
        res.json(ConfigurationModel.getBranchesForYear(Number(req.params.year)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  STUDENT ELECTIVES
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/config/electives/import
 * Import student elective choices from XLSX.
 * Supports multiple PE/OE columns (e.g., PE-1, PE-2, OE-1).
 * Body: {
 *   fileData: "base64",
 *   year: 3,
 *   columnMapping: {
 *     rollNumber: 1,
 *     peSubjectCodes: [2, 3],   // array of PE column indices
 *     oeSubjectCodes: [4]       // array of OE column indices
 *   },
 *   sheetName: "Sheet1",
 *   sheetNames: ["Sheet1", "Sheet2"],
 *   headerRow: 1,
 *   createMissing: true
 * }
 */
router.post('/electives/import', async (req, res) => {
    try {
        const { fileData, year, columnMapping, sheetName, sheetNames, headerRow, createMissing } = req.body;
        if (!fileData) return res.status(400).json({ error: 'fileData is required' });
        if (!year) return res.status(400).json({ error: 'year is required' });
        if (!columnMapping || !columnMapping.rollNumber) {
            return res.status(400).json({ error: 'columnMapping with rollNumber is required' });
        }

        // Normalize column mapping: support both old and new formats
        const peColumns = columnMapping.peSubjectCodes
            || (columnMapping.peSubjectCode ? [columnMapping.peSubjectCode] : []);
        const oeColumns = columnMapping.oeSubjectCodes
            || (columnMapping.oeSubjectCode ? [columnMapping.oeSubjectCode] : []);
        // Legacy single subjectCode with electiveType
        if (columnMapping.subjectCode && peColumns.length === 0 && oeColumns.length === 0) {
            // Determine from old electiveType field in body
            const et = req.body.electiveType || 'PE';
            if (et === 'PE') peColumns.push(columnMapping.subjectCode);
            else oeColumns.push(columnMapping.subjectCode);
        }

        if (peColumns.length === 0 && oeColumns.length === 0) {
            return res.status(400).json({ error: 'At least one PE or OE subject column is required' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const result = { imported: 0, skipped: 0, errors: [] };

        const subjectLookup = {};
        SubjectModel.getAll().forEach(s => {
            subjectLookup[s.subject_code.toUpperCase()] = s;
        });

        const choices = [];
        const typesUsed = new Set();

        const resolveSubject = (subjectCode, rollNumber) => {
            if (!subjectCode) return null;
            let subject = subjectLookup[subjectCode.toUpperCase()];
            if (!subject && createMissing) {
                try {
                    subject = SubjectModel.create({ subjectCode, subjectName: subjectCode });
                    subjectLookup[subjectCode.toUpperCase()] = subject;
                } catch (_) {
                    subject = SubjectModel.getByCode(subjectCode);
                }
            }
            if (!subject) {
                result.skipped++;
                result.errors.push({ rollNumber, reason: `Unknown subject: ${subjectCode}` });
            }
            return subject;
        };

        const processSheet = (worksheet) => {
            const startRow = headerRow || 1;
            worksheet.eachRow((row, rowNum) => {
                if (rowNum <= startRow) return;

                const rollNumber = String(row.getCell(columnMapping.rollNumber).value || '').trim();
                if (!rollNumber || !/\d/.test(rollNumber)) return;
                // Skip section headers
                if (/\b(sem|semester|section|starts|ends|batch)\b/i.test(rollNumber)) return;

                // Process PE columns
                for (const colIdx of peColumns) {
                    const code = String(row.getCell(colIdx).value || '').trim();
                    if (!code) continue;
                    const sub = resolveSubject(code, rollNumber);
                    if (sub) {
                        choices.push({ rollNumber, subjectId: sub.id, year: Number(year), electiveType: 'PE' });
                        result.imported++;
                        typesUsed.add('PE');
                    }
                }

                // Process OE columns
                for (const colIdx of oeColumns) {
                    const code = String(row.getCell(colIdx).value || '').trim();
                    if (!code) continue;
                    const sub = resolveSubject(code, rollNumber);
                    if (sub) {
                        choices.push({ rollNumber, subjectId: sub.id, year: Number(year), electiveType: 'OE' });
                        result.imported++;
                        typesUsed.add('OE');
                    }
                }
            });
        };

        if (sheetNames && sheetNames.length > 0) {
            for (const sn of sheetNames) {
                const ws = workbook.getWorksheet(sn);
                if (ws) processSheet(ws);
            }
        } else if (sheetName) {
            const ws = workbook.getWorksheet(sheetName);
            if (!ws) throw new Error(`Sheet "${sheetName}" not found`);
            processSheet(ws);
        } else {
            for (const ws of workbook.worksheets) {
                processSheet(ws);
            }
        }

        if (choices.length > 0) {
            ConfigurationModel.setStudentElectives(choices);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/electives?year=3&type=PE
 */
router.get('/electives', (req, res) => {
    try {
        const { year, type } = req.query;
        if (!year) return res.status(400).json({ error: 'year is required' });
        if (!type || type === 'ALL') {
            res.json(ConfigurationModel.getElectivesByYear(Number(year)));
        } else {
            res.json(ConfigurationModel.getElectivesByYearType(Number(year), type));
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  EXAM TIMETABLE
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/config/timetable/import
 * Import exam timetable from XLSX.
 * Body: {
 *   fileData: "base64",
 *   year: 2,
 *   columnMapping: { branch: 1, subjectCode: 2, examDate: 3, slot: 4 },
 *   sheetName: "Sheet1",
 *   headerRow: 1,
 *   createMissing: true
 * }
 */
router.post('/timetable/import', async (req, res) => {
    try {
        const { fileData, year, columnMapping, sheetName, headerRow, createMissing } = req.body;
        if (!fileData) return res.status(400).json({ error: 'fileData is required' });
        if (!columnMapping || !columnMapping.branch || !columnMapping.subjectCode || !columnMapping.examDate) {
            return res.status(400).json({ error: 'columnMapping with branch, subjectCode, examDate is required' });
        }
        if (!year && !columnMapping.year) {
            return res.status(400).json({ error: 'year is required (or map an Academic Year column)' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const result = { imported: 0, skipped: 0, errors: [] };

        // Map branch_code → array of all branch rows (one per section)
        const branchLookup = {};
        BranchModel.getAll().forEach(b => {
            const key = b.branch_code.toUpperCase();
            if (!branchLookup[key]) branchLookup[key] = [];
            branchLookup[key].push(b);
        });
        const subjectLookup = {};
        const subjectNameLookup = {};
        const subjectNormalizedLookup = {};
        const subjectNormalizedNameLookup = {};
        const normalizeCode = (code) => code.replace(/[.\s\-_]/g, '').toUpperCase();
        const normalizeName = (name) => {
            return name
                .replace(/professional\s+elective/gi, 'PE')
                .replace(/open\s+elective/gi, 'OE')
                .replace(/[^a-zA-Z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toUpperCase();
        };
        SubjectModel.getAll().forEach(s => {
            subjectLookup[s.subject_code.toUpperCase()] = s;
            subjectNormalizedLookup[normalizeCode(s.subject_code)] = s;
            if (s.subject_name) {
                subjectNameLookup[s.subject_name.toUpperCase()] = s;
                subjectNormalizedNameLookup[normalizeName(s.subject_name)] = s;
            }
        });

        const entries = [];

        const processSheet = (worksheet) => {
            const startRow = headerRow || 1;
            worksheet.eachRow((row, rowNum) => {
                if (rowNum <= startRow) return;

                const branchRaw = String(row.getCell(columnMapping.branch).value || '').trim();
                const subjectCode = String(row.getCell(columnMapping.subjectCode).value || '').trim();
                let examDate = row.getCell(columnMapping.examDate).value;
                const rowYearRaw = columnMapping.year
                    ? String(row.getCell(columnMapping.year).value || '').trim() : '';
                const rowYear = columnMapping.year ? Number(rowYearRaw) : Number(year);
                const slot = columnMapping.slot
                    ? String(row.getCell(columnMapping.slot).value || '').trim() : null;
                const timeSlot = columnMapping.time
                    ? String(row.getCell(columnMapping.time).value || '').trim() : null;
                const semester = columnMapping.semester
                    ? String(row.getCell(columnMapping.semester).value || '').trim() : null;
                const academicYear = columnMapping.academicYear
                    ? String(row.getCell(columnMapping.academicYear).value || '').trim() : null;

                if (!branchRaw || !subjectCode || !examDate) return;
                if (!rowYear || rowYear < 1 || rowYear > 6) {
                    result.skipped++;
                    result.errors.push({ subjectCode, reason: `Invalid academic year: ${rowYearRaw || rowYear}` });
                    return;
                }
                // Skip placeholder/empty subjects like \"-\"
                if (subjectCode === '-' || subjectCode === '\u2014') return;

                // Handle date formats
                if (examDate instanceof Date) {
                    examDate = examDate.toISOString().split('T')[0];
                } else {
                    examDate = String(examDate).trim();
                }

                // Resolve branch — get ALL sections for this branch_code
                let branches = branchLookup[branchRaw.toUpperCase()];
                if ((!branches || branches.length === 0) && createMissing) {
                    try {
                        const newBranch = BranchModel.create({ branchCode: branchRaw, branchName: branchRaw });
                        branchLookup[branchRaw.toUpperCase()] = [newBranch];
                        branches = [newBranch];
                    } catch (_) {
                        const existing = BranchModel.getByCode(branchRaw);
                        if (existing) branches = [existing];
                    }
                }
                if (!branches || branches.length === 0) {
                    result.skipped++;
                    result.errors.push({ subjectCode, reason: `Unknown branch: ${branchRaw}` });
                    return;
                }

                // Resolve subject — try exact code, then normalized code (strip dots/spaces/hyphens), then by name, then normalized name
                let subject = subjectLookup[subjectCode.toUpperCase()]
                    || subjectNormalizedLookup[normalizeCode(subjectCode)]
                    || subjectNameLookup[subjectCode.toUpperCase()]
                    || subjectNormalizedNameLookup[normalizeName(subjectCode)];
                if (!subject && createMissing) {
                    try {
                        subject = SubjectModel.create({ subjectCode, subjectName: subjectCode });
                        subjectLookup[subjectCode.toUpperCase()] = subject;
                    } catch (_) {
                        subject = SubjectModel.getByCode(subjectCode);
                    }
                }
                if (!subject) {
                    result.skipped++;
                    result.errors.push({ subjectCode, reason: `Unknown subject: ${subjectCode}` });
                    return;
                }

                // Create timetable entry for EACH section of this branch
                for (const branch of branches) {
                    entries.push({
                        year: rowYear,
                        branchId: branch.id,
                        subjectId: subject.id,
                        examDate,
                        slot,
                        timeSlot,
                        semester,
                        academicYear
                    });
                }
                result.imported++;
            });
        };

        if (sheetName) {
            const ws = workbook.getWorksheet(sheetName);
            if (!ws) throw new Error(`Sheet "${sheetName}" not found`);
            processSheet(ws);
        } else {
            for (const ws of workbook.worksheets) {
                processSheet(ws);
            }
        }

        if (entries.length > 0) {
            // Replace per year so mapped Academic Year data can contain multiple years.
            const byYear = new Map();
            for (const e of entries) {
                if (!byYear.has(e.year)) byYear.set(e.year, []);
                byYear.get(e.year).push(e);
            }
            for (const [yr, yrEntries] of byYear.entries()) {
                ConfigurationModel.replaceExamTimetable(Number(yr), yrEntries);
            }
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/timetable?year=2
 */
router.get('/timetable', (req, res) => {
    try {
        const { year } = req.query;
        if (year) {
            res.json(ConfigurationModel.getExamTimetableByYear(Number(year)));
        } else {
            res.json(ConfigurationModel.getAllExamTimetable());
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/timetable/dates?year=2
 * Get unique exam dates from timetable.
 */
router.get('/timetable/dates', (req, res) => {
    try {
        const { year } = req.query;
        res.json(ConfigurationModel.getExamDates(year ? Number(year) : null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/timetable/slots?date=2026-01-15&year=2
 * Get unique slots for a given date.
 */
router.get('/timetable/slots', (req, res) => {
    try {
        const { date, year } = req.query;
        if (!date) return res.status(400).json({ error: 'date is required' });
        res.json(ConfigurationModel.getSlotsForDate(date, year ? Number(year) : null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/timetable/years
 * Get unique years from timetable.
 */
router.get('/timetable/years', (req, res) => {
    try {
        res.json(ConfigurationModel.getTimetableYears());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/timetable/by-date?date=2026-01-15&slot=FN
 */
router.get('/timetable/by-date', (req, res) => {
    try {
        const { date, slot } = req.query;
        if (!date) return res.status(400).json({ error: 'date is required' });
        res.json(ConfigurationModel.getExamTimetableByDate(date, slot || null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/config/timetable/:year
 */
router.delete('/timetable/:year', (req, res) => {
    try {
        ConfigurationModel.deleteExamTimetable(Number(req.params.year));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  RESET DATABASE — Delete all data from all tables
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  ROOMS XLSX IMPORT
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/config/rooms/import
 * Body: {
 *   fileData: "base64-encoded-xlsx",
 *   columnMapping: { roomCode: colNum, rows: colNum, columns: colNum, effectiveCapacity?: colNum },
 *   sheetName?: string
 * }
 * Returns: { success: true, created: number, updated: number, errors: string[] }
 */
router.post('/rooms/import', async (req, res) => {
    try {
        const { fileData, columnMapping, sheetName } = req.body;
        if (!fileData) return res.status(400).json({ error: 'fileData (base64) is required' });
        if (!columnMapping || !columnMapping.roomCode || !columnMapping.rows || !columnMapping.columns) {
            return res.status(400).json({ error: 'columnMapping with roomCode, rows, columns is required' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // Find the target sheet
        let worksheet;
        if (sheetName) {
            worksheet = workbook.worksheets.find(ws => ws.name === sheetName);
        }
        if (!worksheet) {
            worksheet = workbook.worksheets[0];
        }
        if (!worksheet) {
            return res.status(400).json({ error: 'No worksheet found in the XLSX file' });
        }

        // Find header row (first row with non-empty cells)
        let headerRowNum = 1;
        for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
            const row = worksheet.getRow(r);
            let hasContent = false;
            row.eachCell((cell) => {
                const val = String(cell.value || '').trim().toLowerCase();
                if (val.includes('room') || val.includes('code') || val.includes('row') || val.includes('column')) {
                    hasContent = true;
                }
            });
            if (hasContent) {
                headerRowNum = r;
                break;
            }
        }

        // Parse rooms from XLSX
        const rooms = [];
        for (let r = headerRowNum + 1; r <= worksheet.rowCount; r++) {
            const row = worksheet.getRow(r);
            const roomCode = String(row.getCell(columnMapping.roomCode).value || '').trim();
            const rowsVal = row.getCell(columnMapping.rows).value;
            const colsVal = row.getCell(columnMapping.columns).value;
            const effCapVal = columnMapping.effectiveCapacity
                ? row.getCell(columnMapping.effectiveCapacity).value
                : null;

            if (!roomCode) continue; // Skip empty rows

            const rowsNum = Number(rowsVal);
            const colsNum = Number(colsVal);
            const effCapNum = effCapVal ? Number(effCapVal) : null;

            if (isNaN(rowsNum) || isNaN(colsNum) || rowsNum <= 0 || colsNum <= 0) {
                continue; // Skip invalid rows
            }

            rooms.push({
                roomCode,
                rows: rowsNum,
                columns: colsNum,
                effectiveCapacity: effCapNum
            });
        }

        if (rooms.length === 0) {
            return res.status(400).json({ error: 'No valid room data found in the XLSX file' });
        }

        // Bulk import rooms
        const result = RoomModel.bulkImport(rooms);

        res.json({
            success: true,
            created: result.created,
            updated: result.updated,
            errors: result.errors,
            totalProcessed: rooms.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/config/reset
 * Deletes all data from every table in the database.
 * Tables are cleared in dependency order (children first).
 */
router.delete('/reset', (req, res) => {
    try {
        const db = getDb();

        // Delete in dependency order: children before parents
        const tables = [
            'allocation_reports',
            'seat_allocations',
            'students',
            'session_branch_subjects',
            'session_rooms',
            'exam_sessions',
            'student_electives',
            'exam_timetable',
            'year_branch_subjects',
            'student_master',
            'subjects',
            'branches',
            'rooms',
        ];

        const deleteAll = db.transaction(() => {
            for (const table of tables) {
                db.prepare(`DELETE FROM ${table}`).run();
            }
        });

        deleteAll();

        res.json({ success: true, message: 'All database data has been deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/config/diagnostics/elective-mismatch
 * Check for mismatches between timetable elective subjects and student elective choices.
 */
router.get('/diagnostics/elective-mismatch', (req, res) => {
    try {
        const db = getDb();
        const { year } = req.query;
        const yearNum = year ? Number(year) : null;

        // Get all PE/OE subjects from timetable
        let timetableSql = `
            SELECT DISTINCT et.subject_id, s.subject_code, s.subject_name, et.year,
                   GROUP_CONCAT(DISTINCT b.branch_code) as branches
            FROM exam_timetable et
            JOIN subjects s ON s.id = et.subject_id
            JOIN branches b ON b.id = et.branch_id
            JOIN year_branch_subjects ybs
              ON ybs.year = et.year AND ybs.branch_id = et.branch_id AND ybs.subject_id = et.subject_id
            WHERE ybs.subject_type IN ('PE', 'OE')
        `;
        if (yearNum) timetableSql += ` AND et.year = ${yearNum}`;
        timetableSql += ` GROUP BY et.subject_id ORDER BY et.year, s.subject_name`;
        const timetableElectives = db.prepare(timetableSql).all();

        // Get all student elective choices
        let studentSql = `
            SELECT DISTINCT se.subject_id, s.subject_code, s.subject_name, se.year,
                   COUNT(DISTINCT se.roll_number) as student_count
            FROM student_electives se
            JOIN subjects s ON s.id = se.subject_id
        `;
        if (yearNum) studentSql += ` WHERE se.year = ${yearNum}`;
        studentSql += ` GROUP BY se.subject_id ORDER BY se.year, s.subject_name`;
        const studentElectives = db.prepare(studentSql).all();

        // Find mismatches
        const timetableSubjectIds = new Set(timetableElectives.map(t => t.subject_id));
        const studentSubjectIds = new Set(studentElectives.map(s => s.subject_id));

        const mismatches = {
            inTimetableOnly: timetableElectives.filter(t => !studentSubjectIds.has(t.subject_id)),
            inStudentElectivesOnly: studentElectives.filter(s => !timetableSubjectIds.has(s.subject_id)),
            matched: timetableElectives.filter(t => studentSubjectIds.has(t.subject_id))
        };

        res.json({
            timetableElectives,
            studentElectives,
            mismatches,
            summary: {
                timetableCount: timetableElectives.length,
                studentElectiveCount: studentElectives.length,
                matchedCount: mismatches.matched.length,
                inTimetableOnlyCount: mismatches.inTimetableOnly.length,
                inStudentElectivesOnlyCount: mismatches.inStudentElectivesOnly.length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
