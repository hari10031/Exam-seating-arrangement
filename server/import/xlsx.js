/**
 * ============================================================
 *  XLSX IMPORT
 * ============================================================
 *  Imports student data from Excel files with:
 *  - Roll Number
 *  - Student Name
 *  - Branch (code or name)
 * ============================================================
 */
const ExcelJS = require('exceljs');
const { getDb } = require('../db/connection');
const BranchModel = require('../models/Branch');

/**
 * Parse a single worksheet and extract student data
 * @param {Worksheet} worksheet - ExcelJS worksheet
 * @returns {Array<{rollNumber: string, studentName: string, branch: string}>}
 */
function parseWorksheet(worksheet) {
    const students = [];

    // Auto-detect header row by searching first 20 rows for "Roll" column
    let headerRowNum = -1;
    let rollCol = -1, nameCol = -1, branchCol = -1;

    for (let r = 1; r <= Math.min(20, worksheet.rowCount); r++) {
        const row = worksheet.getRow(r);
        let foundRoll = false, foundBranch = false;
        let tempRollCol = -1, tempNameCol = -1, tempBranchCol = -1;

        row.eachCell((cell, colNum) => {
            const header = String(cell.value || '').toLowerCase().trim();

            // Check for Roll Number column
            if (header.includes('roll') || header.includes('ht no') || header.includes('htno') || header.includes('hallticket')) {
                tempRollCol = colNum;
                foundRoll = true;
            }
            // Check for Name column
            else if (header.includes('name') && (header.includes('student') || header.includes('of the'))) {
                tempNameCol = colNum;
            }
            else if (header === 'name' || header.startsWith('name ')) {
                tempNameCol = colNum;
            }
            // Check for Branch column
            else if (header.includes('branch') || header.includes('dept') || header.includes('department')) {
                tempBranchCol = colNum;
                foundBranch = true;
            }
        });

        // Found the header row if it has both Roll and Branch columns
        if (foundRoll && foundBranch) {
            headerRowNum = r;
            rollCol = tempRollCol;
            nameCol = tempNameCol;
            branchCol = tempBranchCol;
            break;
        }
    }

    if (headerRowNum === -1 || rollCol === -1 || branchCol === -1) {
        return []; // No valid header found in this worksheet
    }

    // Parse data rows (starting from row after header)
    worksheet.eachRow((row, rowNum) => {
        if (rowNum <= headerRowNum) return; // Skip header and rows before it

        const rollNumber = String(row.getCell(rollCol).value || '').trim();
        const studentName = nameCol !== -1 ? String(row.getCell(nameCol).value || '').trim() : null;
        const branch = String(row.getCell(branchCol).value || '').trim();

        // Validate roll number format (should contain digits, not be a serial number)
        const isValidRoll = rollNumber &&
            (rollNumber.includes('-') || rollNumber.length > 3) &&
            /\d/.test(rollNumber);

        if (isValidRoll && branch && branch.length <= 20) {
            students.push({
                rollNumber,
                studentName: studentName || null,
                branch
            });
        }
    });

    return students;
}

/**
 * Parse XLSX file and extract student data from ALL worksheets
 * Auto-detects header row by searching for columns containing "Roll", "Name", "Branch"
 * @param {Buffer|string} filePathOrBuffer - File path or buffer
 * @returns {Promise<Array<{rollNumber: string, studentName: string, branch: string}>>}
 */
async function parseXlsxStudents(filePathOrBuffer) {
    const workbook = new ExcelJS.Workbook();

    if (Buffer.isBuffer(filePathOrBuffer)) {
        await workbook.xlsx.load(filePathOrBuffer);
    } else {
        await workbook.xlsx.readFile(filePathOrBuffer);
    }

    if (workbook.worksheets.length === 0) {
        throw new Error('No worksheets found in the Excel file');
    }

    const allStudents = [];
    const seenRolls = new Set();

    // Process ALL worksheets in the workbook
    for (const worksheet of workbook.worksheets) {
        const students = parseWorksheet(worksheet);

        // Add unique students only (avoid duplicates across sheets)
        for (const student of students) {
            if (!seenRolls.has(student.rollNumber)) {
                seenRolls.add(student.rollNumber);
                allStudents.push(student);
            }
        }
    }

    return allStudents;
}

/**
 * Import students from parsed XLSX data into a session
 * @param {number} sessionId - The exam session ID
 * @param {Array<{rollNumber: string, studentName: string, branch: string}>} students - Parsed student data
 * @param {Object} options - Import options
 * @param {boolean} options.createMissingBranches - Auto-create branches that don't exist
 * @param {number|null} options.defaultSubjectId - Default subject ID if not specified
 * @param {Object} options.branchSubjectMap - Map of branch code to subject ID {branchCode: subjectId}
 * @returns {Object} Import result with counts and errors
 */
function importStudentsToSession(sessionId, students, options = {}) {
    const db = getDb();
    const {
        createMissingBranches = false,
        defaultSubjectId = null,
        branchSubjectMap = {}
    } = options;

    // Get all existing branches
    const branches = BranchModel.getAll();
    const branchLookup = {};
    for (const b of branches) {
        branchLookup[b.branch_code.toUpperCase()] = b;
        branchLookup[b.branch_name.toUpperCase()] = b;
    }

    // Get session's branch-subject mappings
    const sessionBranchSubjects = db.prepare(`
        SELECT sbs.branch_id, sbs.subject_id, b.branch_code
        FROM session_branch_subjects sbs
        JOIN branches b ON b.id = sbs.branch_id
        WHERE sbs.session_id = ?
    `).all(sessionId);

    const sessionBranchSubjectMap = {};
    for (const sbs of sessionBranchSubjects) {
        sessionBranchSubjectMap[sbs.branch_id] = sbs.subject_id;
    }

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO students (session_id, branch_id, subject_id, roll_number, student_name)
        VALUES (?, ?, ?, ?, ?)
    `);

    const results = {
        imported: 0,
        skipped: 0,
        errors: [],
        createdBranches: []
    };

    const txn = db.transaction(() => {
        for (const student of students) {
            try {
                const branchKey = student.branch.toUpperCase();
                let branch = branchLookup[branchKey];

                // Create branch if missing and option enabled
                if (!branch && createMissingBranches) {
                    const newBranch = BranchModel.create({
                        branchCode: student.branch,
                        branchName: student.branch
                    });
                    branch = newBranch;
                    branchLookup[newBranch.branch_code.toUpperCase()] = newBranch;
                    results.createdBranches.push(newBranch.branch_code);
                }

                if (!branch) {
                    results.skipped++;
                    results.errors.push({
                        rollNumber: student.rollNumber,
                        reason: `Unknown branch: ${student.branch}`
                    });
                    continue;
                }

                // Determine subject ID
                let subjectId = branchSubjectMap[branch.branch_code]
                    || sessionBranchSubjectMap[branch.id]
                    || defaultSubjectId;

                if (!subjectId) {
                    results.skipped++;
                    results.errors.push({
                        rollNumber: student.rollNumber,
                        reason: `No subject mapped for branch: ${student.branch}`
                    });
                    continue;
                }

                insertStmt.run(
                    sessionId,
                    branch.id,
                    subjectId,
                    student.rollNumber,
                    student.studentName
                );
                results.imported++;

            } catch (err) {
                results.skipped++;
                results.errors.push({
                    rollNumber: student.rollNumber,
                    reason: err.message
                });
            }
        }
    });

    txn();
    return results;
}

/**
 * Full import pipeline: parse XLSX and insert into session
 * @param {number} sessionId - The exam session ID
 * @param {Buffer|string} filePathOrBuffer - XLSX file path or buffer
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import result
 */
async function importXlsxToSession(sessionId, filePathOrBuffer, options = {}) {
    const students = await parseXlsxStudents(filePathOrBuffer);

    if (students.length === 0) {
        return {
            imported: 0,
            skipped: 0,
            errors: [{ reason: 'No valid student data found in the file' }],
            totalInFile: 0
        };
    }

    const result = importStudentsToSession(sessionId, students, options);
    result.totalInFile = students.length;

    return result;
}

/**
 * Generate a sample XLSX template for student import
 * @returns {Promise<Buffer>}
 */
async function generateImportTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Exam Seating System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Students');
    sheet.columns = [
        { header: 'Roll Number', key: 'rollNumber', width: 20 },
        { header: 'Student Name', key: 'studentName', width: 30 },
        { header: 'Branch', key: 'branch', width: 15 }
    ];

    // Style header row
    sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
        cell.alignment = { horizontal: 'center' };
    });

    // Add sample data
    sheet.addRow({ rollNumber: '2451-23-733-001', studentName: 'John Doe', branch: 'CSE' });
    sheet.addRow({ rollNumber: '2451-23-733-002', studentName: 'Jane Smith', branch: 'CSE' });
    sheet.addRow({ rollNumber: '2451-23-751-001', studentName: 'Bob Wilson', branch: 'CSIT' });

    return await workbook.xlsx.writeBuffer();
}

module.exports = {
    parseXlsxStudents,
    importStudentsToSession,
    importXlsxToSession,
    generateImportTemplate
};
