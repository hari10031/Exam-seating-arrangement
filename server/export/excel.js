/**
 * ============================================================
 *  EXCEL EXPORT
 * ============================================================
 *  Generates a .xlsx workbook with:
 *  - Sheet 1: Flat allocation table (Room, Row, Col, Seat, Roll, Branch, Subject)
 *  - Sheet 2: Validation report summary
 *  - Sheet per room: Visual grid layout
 * ============================================================
 */
const ExcelJS = require('exceljs');

/**
 * Generate an Excel buffer for download.
 *
 * @param {Object} params
 * @param {string} params.sessionName
 * @param {Array}  params.allocations  - Flat allocation list
 * @param {Array}  params.roomGrids    - Array of { roomCode, rows, columns, grid }
 * @param {Object} params.report       - Validation report
 * @returns {Promise<Buffer>}
 */
async function generateExcel({ sessionName, allocations, roomGrids, report, roomSummary = [], sessionInfo = {} }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Exam Seating System';
    workbook.created = new Date();
    const containscheck = ['CIC', 'CSD', 'CSIT', 'CSM'];

    // ── SHEET 1: Flat Allocation Table ──────────────────────────
    const sheet1 = workbook.addWorksheet('Allocations');
    sheet1.columns = [
        { header: 'Room', key: 'room', width: 12 },
        { header: 'Row', key: 'row', width: 8 },
        { header: 'Column', key: 'col', width: 8 },
        { header: 'Seat', key: 'seat', width: 8 },
        { header: 'Roll Number', key: 'rollNumber', width: 18 },
        { header: 'Student Name', key: 'studentName', width: 25 },
        { header: 'Branch', key: 'branch', width: 15 },
        { header: 'Subject', key: 'subject', width: 30 }
    ];

    // Style header row
    sheet1.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
        cell.alignment = { horizontal: 'center' };
    });

    for (const a of allocations) {
        sheet1.addRow({
            room: a.room_code || a.roomCode || '',
            row: a.row_number || a.rowNumber,
            col: a.column_number || a.columnNumber,
            seat: a.seat_position || a.seatPosition,
            rollNumber: a.roll_number || a.rollNumber || '',
            studentName: a.student_name || a.studentName || '',
            branch: a.branch_code || a.branchCode || '',
            subject: a.subject_name || a.subjectName || ''
        });
    }

    // Auto-filter
    sheet1.autoFilter = { from: 'A1', to: 'H1' };

    // ── SHEET 2: Summary Report ─────────────────────────────────
    const sheet2 = workbook.addWorksheet('Summary');
    sheet2.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 20 }
    ];
    sheet2.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
    });

    sheet2.addRow({ metric: 'Session', value: sessionName });
    sheet2.addRow({ metric: 'Total Students', value: report.totalStudents });
    sheet2.addRow({ metric: 'Total Seats', value: report.totalSeats });
    sheet2.addRow({ metric: 'Assigned', value: report.assignedCount });
    sheet2.addRow({ metric: 'Unassigned', value: report.unassignedCount });

    if (report.unassignedReasons && report.unassignedReasons.length > 0) {
        sheet2.addRow({ metric: '', value: '' });
        sheet2.addRow({ metric: 'Unassigned Details', value: '' });
        for (const u of report.unassignedReasons) {
            sheet2.addRow({ metric: `Roll: ${u.rollNumber}`, value: u.reason });
        }
    }

    // ── SHEET: Room-wise Allocation Summary ──────────────────
    if (roomSummary && roomSummary.length > 0) {
        const summarySheet = workbook.addWorksheet('Room-wise Summary');
        summarySheet.columns = [
            { header: 'S.No', key: 'sNo', width: 8 },
            { header: 'Subject', key: 'subject', width: 35 },
            { header: 'Branch', key: 'branch', width: 15 },
            { header: 'H.T. Numbers', key: 'htNumbers', width: 30 },
            { header: 'Room Number', key: 'room', width: 18 },
            { header: 'No. of Students', key: 'count', width: 16 }
        ];

        // Style header row
        summarySheet.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' }
            };
        });

        let currentSubject = '';
        let dataRowNum = 1; // after header
        let totalStudents = 0;

        for (const row of roomSummary) {
            // Add subject section header row
            if (row.subjectName !== currentSubject) {
                currentSubject = row.subjectName;
                dataRowNum++;
                const subjRow = summarySheet.getRow(dataRowNum);
                summarySheet.mergeCells(dataRowNum, 1, dataRowNum, 6);
                const subjCell = subjRow.getCell(1);
                subjCell.value = `Subject: ${currentSubject}`;
                subjCell.font = { bold: true, size: 11 };
                subjCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
                subjCell.alignment = { horizontal: 'left' };
                subjCell.border = {
                    top: { style: 'thin' }, bottom: { style: 'thin' },
                    left: { style: 'thin' }, right: { style: 'thin' }
                };
            }

            dataRowNum++;
            const excelRow = summarySheet.getRow(dataRowNum);
            excelRow.values = [row.sNo, row.subjectName, row.branchCode, row.rollRange, row.roomCode, row.count];

            // Alternate row coloring
            const bgColor = row.sNo % 2 === 0 ? 'FFF8F9FA' : 'FFFFFFFF';
            excelRow.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                cell.alignment = { horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' }, bottom: { style: 'thin' },
                    left: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            totalStudents += row.count;
        }

        // Total row
        dataRowNum++;
        const totalRow = summarySheet.getRow(dataRowNum);
        summarySheet.mergeCells(dataRowNum, 1, dataRowNum, 5);
        totalRow.getCell(1).value = 'TOTAL';
        totalRow.getCell(1).font = { bold: true };
        totalRow.getCell(1).alignment = { horizontal: 'right' };
        totalRow.getCell(6).value = totalStudents;
        totalRow.getCell(6).font = { bold: true };
        totalRow.getCell(6).alignment = { horizontal: 'center' };
        totalRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
            cell.border = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' }
            };
        });

        summarySheet.autoFilter = { from: 'A1', to: 'F1' };
    }

    // ── COMMON DATA & HELPERS ──────────────────────────────────────────────────

    // Derive semester label from year
    const yearNum = Number(sessionInfo.year) || 0;
    const semLabels = { 1: 'I/II SEM', 2: 'III/IV SEM', 3: 'V/VI SEM', 4: 'VII/VIII SEM' };
    const semLabel = semLabels[yearNum] || '';
    const examDate = sessionInfo.examDate || '';
    const timeSlot = sessionInfo.slot || '';

    // Thin border helper
    const thinBorder = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
    };

    // Group allocations by room+branch+section+subject
    const allocationsByRoomBranch = {};
    for (const a of allocations) {
        const roomCode = a.room_code || a.roomCode || 'Unknown';
        const branchCode = a.branch_code || a.branchCode || 'Unknown';
        const branchSection = a.branch_section || a.branchSection || '';
        const subjectName = a.subject_name || a.subjectName || 'Unknown';
        const subjectCode = a.subject_code || a.subjectCode || '';
        const studentName = a.student_name || a.studentName || '';
        const key = `${roomCode}|||${branchCode}|||${branchSection}|||${subjectName}`;
        if (!allocationsByRoomBranch[key]) {
            allocationsByRoomBranch[key] = { roomCode, branchCode, branchSection, subjectName, subjectCode, allocations: [] };
        }
        allocationsByRoomBranch[key].allocations.push(a);
    }

    const sortedKeys = Object.keys(allocationsByRoomBranch).sort((a, b) => {
        const [roomA, branchA, secA, subjA] = a.split('|||');
        const [roomB, branchB, secB, subjB] = b.split('|||');
        if (roomA !== roomB) return roomA.localeCompare(roomB);
        if (branchA !== branchB) return branchA.localeCompare(branchB);
        if (secA !== secB) return secA.localeCompare(secB);
        return subjA.localeCompare(subjB);
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  PER-ROOM ATTENDANCE SHEETS  (S.No | Roll No | Name | Sign)
    // ══════════════════════════════════════════════════════════════════════════
    for (const key of sortedKeys) {
        const { roomCode, branchCode, branchSection, subjectName, allocations: roomBranchAllocs } = allocationsByRoomBranch[key];

        const sectionSuffix = branchSection ? `-${branchSection}` : '';
        const sheetName = `${roomCode}-${branchCode}${sectionSuffix}`.substring(0, 31);
        let finalSheetName = sheetName;
        let counter = 2;
        while (workbook.getWorksheet(finalSheetName)) {
            const sfx = `-${counter}`;
            finalSheetName = sheetName.substring(0, 31 - sfx.length) + sfx;
            counter++;
        }
        const ws = workbook.addWorksheet(finalSheetName);

        const COLS = 5; // A-E for info, then table uses A-D
        ws.getColumn(1).width = 10;
        ws.getColumn(2).width = 22;
        ws.getColumn(3).width = 35;
        ws.getColumn(4).width = 18;
        ws.getColumn(5).width = 20;

        const sortedAllocs = roomBranchAllocs
            .filter(a => a.roll_number || a.rollNumber)
            .sort((a, b) => (a.roll_number || a.rollNumber || '').localeCompare(b.roll_number || b.rollNumber || ''));
        const totalStudents = sortedAllocs.length;

        const branchLabel = branchSection ? `${branchCode} - ${branchSection}` : branchCode;

        let row = 1;

        // Row 1: College name
        ws.mergeCells(row, 1, row, COLS);
        const collegeCell = ws.getCell(row, 1);
        collegeCell.value = 'MVSR Engineering College';
        collegeCell.font = { bold: true, size: 14 };
        collegeCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;

        // Row 2: Department name
        row++;
        ws.mergeCells(row, 1, row, COLS);
        const deptCell = ws.getCell(row, 1);
        // deptCell.value = `Department of ${branchLabel}`;
        if (containscheck.includes(branchCode)) {
            deptCell.value = `Department of CSE ALIED Branches`;

        } else {
            deptCell.value = `Department of CSE `;

        }
        deptCell.font = { size: 11 };
        deptCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 3: CIE Attendance Statement (not "Consolidated")
        row++;
        ws.mergeCells(row, 1, row, COLS);
        const cieCell = ws.getCell(row, 1);
        cieCell.value = 'Continuous Internal Assessment (CIE)-I Attendance Statement';
        cieCell.font = { bold: true, size: 13 };
        cieCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;

        // Row 4: Info table row 1 — Subject | (value) | Branch | BE(CSE) | Total Students
        row++;
        const infoStart = row;
        ws.getCell(row, 1).value = 'Subject';
        ws.getCell(row, 2).value = subjectName;
        ws.getCell(row, 3).value = `Branch: BE (${branchLabel})`;
        // ws.getCell(row, 4).value = `BE (${branchLabel})`;
        // ws.getCell(row, 5).value = 'Total Students';
        ws.getCell(row, 4).value = `Total Students: `;
        ws.getCell(row, 4).font = { bold: true };

        // Row 5: Time | value | (blank) | BE VII SEM | No of Students Present
        row++;
        ws.getCell(row, 1).value = 'Time';
        ws.getCell(row, 2).value = timeSlot;
        ws.getCell(row, 3).value = `Room No : ${roomCode}`;
        // ws.getCell(row, 4).value = semLabel ? `BE ${semLabel}` : '';
        ws.getCell(row, 4).value = 'No of Students Present: ';
        ws.getCell(row, 4).font = { bold: true };

        // Row 6: Date | value | Room No | (value) | No of Students Absent
        row++;
        ws.getCell(row, 1).value = 'Date';
        ws.getCell(row, 2).value = examDate;
        //Db change
        ws.getCell(row, 3).value = 'Acadmeic Year';
        ws.getCell(row, 4).value = 'No of Students Absent';
        // ws.getCell(row, 4).value = roomCode;
        // ws.getCell(row, 5).value = 'No of Students Absent';

        // Style info table
        for (let r = infoStart; r <= row; r++) {
            for (let c = 1; c <= COLS; c++) {
                const cell = ws.getCell(r, c);
                cell.border = thinBorder;
                cell.alignment = { vertical: 'middle', wrapText: true };
                if (c === 1 || c === 3 || c === 5) {
                    cell.font = { bold: true, size: 11 };
                } else {
                    cell.font = { size: 11 };
                }
            }
        }

        // Blank separator
        row++;

        // Table header: S.No | Roll No | Name | Sign
        row++;
        const tableStart = row;
        const tableHeaders = ['S.No', 'Roll No', 'Name', 'Sign'];
        const tableCols = [1, 2, 3, 4];
        tableHeaders.forEach((h, i) => {
            const cell = ws.getCell(row, tableCols[i]);
            cell.value = h;
            cell.font = { bold: true, size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder;
        });

        // Student rows
        for (let i = 0; i < sortedAllocs.length; i++) {
            row++;
            const a = sortedAllocs[i];
            const rollNo = a.roll_number || a.rollNumber || '';
            const studentName = a.student_name || a.studentName || '';
            ws.getCell(row, 1).value = i + 1;
            ws.getCell(row, 2).value = rollNo;
            ws.getCell(row, 3).value = studentName;
            ws.getCell(row, 4).value = '';
            for (let c = 1; c <= 4; c++) {
                const cell = ws.getCell(row, c);
                cell.border = thinBorder;
                cell.font = { size: 10 };
                cell.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle' };
            }
        }

        // Total students row
        row++;
        ws.mergeCells(row, 1, row, 3);
        ws.getCell(row, 1).value = `Total Students: ${totalStudents}`;
        ws.getCell(row, 1).font = { bold: true, size: 11 };
        ws.getCell(row, 1).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(row, 4).value = '';
        for (let c = 1; c <= 4; c++) {
            ws.getCell(row, c).border = thinBorder;
        }

        // Invigilator signature section
        row += 3;
        ws.getCell(row, 1).value = 'Invigilator Signature:';
        ws.getCell(row, 1).font = { bold: true, size: 11 };
        ws.mergeCells(row, 2, row, 4);
        ws.getCell(row, 2).border = { bottom: { style: 'thin' } };

        row += 2;
        // ws.getCell(row, 1).value = 'Room No:';
        // ws.getCell(row, 1).font = { bold: true, size: 11 };
        // ws.getCell(row, 2).value = roomCode;
        // ws.getCell(row, 2).font = { size: 11 };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PER-BRANCH CONSOLIDATED SHEETS  (Roll number grid, all rooms combined)
    //  One sheet per branch (combining ALL sections) with all roll numbers
    // ══════════════════════════════════════════════════════════════════════════
    // Group allocations by branch only (combine all sections)
    const allocationsByBranch = {};
    for (const a of allocations) {
        const branchCode = a.branch_code || a.branchCode || 'Unknown';
        const key = branchCode;
        if (!allocationsByBranch[key]) {
            allocationsByBranch[key] = { branchCode, allocations: [] };
        }
        allocationsByBranch[key].allocations.push(a);
    }

    const branchKeys = Object.keys(allocationsByBranch).sort();

    for (const bKey of branchKeys) {
        const { branchCode, allocations: branchAllocs } = allocationsByBranch[bKey];

        const sheetName = `${branchCode}-All`.substring(0, 31);
        let finalSheetName = sheetName;
        let counter = 2;
        while (workbook.getWorksheet(finalSheetName)) {
            const sfx = `-${counter}`;
            finalSheetName = sheetName.substring(0, 31 - sfx.length) + sfx;
            counter++;
        }
        const ws = workbook.addWorksheet(finalSheetName);

        const ROLL_COLS = 5;
        for (let c = 1; c <= ROLL_COLS; c++) {
            ws.getColumn(c).width = 22;
        }
        ws.getColumn(6).width = 20;

        // Deduplicate by roll_number (student may appear in multiple subjects)
        const seenRolls = new Set();
        const sortedAllocs = branchAllocs
            .filter(a => {
                const roll = a.roll_number || a.rollNumber;
                if (!roll || seenRolls.has(roll)) return false;
                seenRolls.add(roll);
                return true;
            })
            .sort((a, b) => {
                // Sort by section first, then by roll number
                const secA = a.branch_section || a.branchSection || '';
                const secB = b.branch_section || b.branchSection || '';
                const secCmp = secA.localeCompare(secB);
                if (secCmp !== 0) return secCmp;
                return (a.roll_number || a.rollNumber || '').localeCompare(b.roll_number || b.rollNumber || '');
            });
        const totalStudents = sortedAllocs.length;

        const branchLabel = branchCode;

        let row = 1;

        // Row 1: College name
        ws.mergeCells(row, 1, row, ROLL_COLS);
        ws.getCell(row, 1).value = 'MVSR Engineering College';
        ws.getCell(row, 1).font = { bold: true, size: 14 };
        ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;

        // Row 2: Department
        row++;
        ws.mergeCells(row, 1, row, ROLL_COLS);
        // ws.getCell(row, 1).value = `Department of ${branchLabel}`;
        if (containscheck.includes(branchLabel)) {
            ws.getCell(row, 1).value = `Department of CSE ALIED Branches`;

        } else {
            ws.getCell(row, 1).value = `Department of CSE `;

        }
        ws.getCell(row, 1).font = { size: 11 };
        ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 3: CIE Consolidated Attendance Statement
        row++;
        ws.mergeCells(row, 1, row, ROLL_COLS);
        ws.getCell(row, 1).value = 'Continuous Internal Assessment (CIE)-I Consolidated Attendance Statement';
        ws.getCell(row, 1).font = { bold: true, size: 13 };
        ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;

        // Row 4: Info table (3 rows × 6 columns)
        row++;
        const ICOLS = 6;
        const infoStart = row;
        ws.getCell(row, 1).value = 'Branch';
        ws.getCell(row, 2).value = `BE (${branchLabel})`;
        ws.getCell(row, 3).value = 'Total Students';
        ws.getCell(row, 4).value = totalStudents;
        // ws.getCell(row, 5).value = '';
        // ws.getCell(row, 6).value = '';

        row++;
        ws.getCell(row, 1).value = 'Time';
        ws.getCell(row, 2).value = timeSlot;
        ws.getCell(row, 3).value = 'No of Students Present';
        // ws.getCell(row, 4).value = semLabel ? `BE ${semLabel}` : '';
        ws.getCell(row, 4).value = '';
        // ws.getCell(row, 5).value = '';
        // ws.getCell(row, 6).value = '';

        row++;
        ws.getCell(row, 1).value = 'Date';
        ws.getCell(row, 2).value = examDate;
        //Db change
        ws.getCell(row, 3).value = 'Year';
        ws.getCell(row, 4).value = 'No of Students Absent';
        // ws.getCell(row, 5).value = 'No of Students Absent';
        // ws.getCell(row, 6).value = '';

        // Style info table
        for (let r = infoStart; r <= row; r++) {
            for (let c = 1; c <= ICOLS; c++) {
                const cell = ws.getCell(r, c);
                cell.border = thinBorder;
                cell.alignment = { vertical: 'middle', wrapText: true };
                if (c === 1 || c === 3 || c === 5) {
                    cell.font = { bold: true, size: 11 };
                } else {
                    cell.font = { size: 11 };
                }
            }
        }
        ws.getCell(infoStart, 6).font = { bold: true, size: 11 };

        // Blank separator
        row++;

        // "Total Roll Nos" header
        row++;
        ws.mergeCells(row, 1, row, ROLL_COLS);
        const rollHeader = ws.getCell(row, 1);
        rollHeader.value = 'Total Roll Nos';
        rollHeader.font = { bold: true, size: 13 };
        rollHeader.alignment = { horizontal: 'center', vertical: 'middle' };
        rollHeader.border = thinBorder;
        ws.getCell(row, ROLL_COLS).border = thinBorder;

        // Roll numbers grid: 5 columns, grouped by section
        // Group sortedAllocs by section
        const sectionGroups = {};
        for (const a of sortedAllocs) {
            const sec = a.branch_section || a.branchSection || '';
            if (!sectionGroups[sec]) sectionGroups[sec] = [];
            sectionGroups[sec].push(a.roll_number || a.rollNumber || '');
        }
        const sectionKeys = Object.keys(sectionGroups).sort();

        for (const sec of sectionKeys) {
            const rollNumbers = sectionGroups[sec];

            // Section header row
            if (sectionKeys.length > 1 || sec) {
                row++;
                ws.mergeCells(row, 1, row, ROLL_COLS);
                const secHeader = ws.getCell(row, 1);
                secHeader.value = `Section ${sec || 'N/A'} (${rollNumbers.length} students)`;
                secHeader.font = { bold: true, size: 11 };
                secHeader.alignment = { horizontal: 'center', vertical: 'middle' };
                secHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
                secHeader.border = thinBorder;
                ws.getRow(row).height = 22;
            }

            for (let i = 0; i < rollNumbers.length; i += ROLL_COLS) {
                row++;
                const excelRow = ws.getRow(row);
                for (let c = 0; c < ROLL_COLS; c++) {
                    const cell = excelRow.getCell(c + 1);
                    const idx = i + c;
                    cell.value = idx < rollNumbers.length ? rollNumbers[idx] : '';
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = thinBorder;
                    cell.font = { size: 10 };
                }
                excelRow.height = 20;
            }
        }

        // Signature section
        row += 3;
        ws.getCell(row, 1).value = 'Faculty Signature:';
        ws.getCell(row, 1).font = { bold: true, size: 11 };
        ws.mergeCells(row, 2, row, 3);
        ws.getCell(row, 2).border = { bottom: { style: 'thin' } };

        ws.getCell(row, 4).value = 'HOD Signature:';
        ws.getCell(row, 4).font = { bold: true, size: 11 };
        ws.getCell(row, 5).border = { bottom: { style: 'thin' } };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PER BRANCH+SECTION ATTENDANCE SHEETS
    //  One sheet per branch+section listing ALL students with Room, Subject, Sign
    // ══════════════════════════════════════════════════════════════════════════
    const allocationsByBranchSection = {};
    for (const a of allocations) {
        const branchCode = a.branch_code || a.branchCode || 'Unknown';
        const branchSection = a.branch_section || a.branchSection || '';
        const key = branchSection ? `${branchCode}|||${branchSection}` : `${branchCode}|||`;
        if (!allocationsByBranchSection[key]) {
            allocationsByBranchSection[key] = { branchCode, branchSection, allocations: [] };
        }
        allocationsByBranchSection[key].allocations.push(a);
    }

    const branchSectionKeys = Object.keys(allocationsByBranchSection).sort();
    for (const bsKey of branchSectionKeys) {
        const { branchCode, branchSection, allocations: bsAllocs } = allocationsByBranchSection[bsKey];

        const sectionSuffix = branchSection ? `-${branchSection}` : '';
        const sheetName = `Att-${branchCode}${sectionSuffix}`.substring(0, 31);
        let finalSheetName = sheetName;
        let counter = 2;
        while (workbook.getWorksheet(finalSheetName)) {
            const sfx = `-${counter}`;
            finalSheetName = sheetName.substring(0, 31 - sfx.length) + sfx;
            counter++;
        }
        const ws = workbook.addWorksheet(finalSheetName);

        const COLS = 6;
        ws.getColumn(1).width = 8;   // S.No
        ws.getColumn(2).width = 22;  // Roll No
        ws.getColumn(3).width = 28;  // Name
        ws.getColumn(4).width = 14;  // Room
        ws.getColumn(5).width = 30;  // Subject
        ws.getColumn(6).width = 18;  // Sign

        const sortedAllocs = bsAllocs
            .filter(a => a.roll_number || a.rollNumber)
            .sort((a, b) => (a.roll_number || a.rollNumber || '').localeCompare(b.roll_number || b.rollNumber || ''));
        const totalStudents = sortedAllocs.length;
        const branchLabel = branchSection ? `${branchCode} - ${branchSection}` : branchCode;

        let row = 1;

        // Row 1: College name
        ws.mergeCells(row, 1, row, COLS);
        const collegeCell = ws.getCell(row, 1);
        collegeCell.value = 'MVSR Engineering College';
        collegeCell.font = { bold: true, size: 14 };
        collegeCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;

        // Row 2: Department
        row++;
        ws.mergeCells(row, 1, row, COLS);
        const deptCell = ws.getCell(row, 1);
        if (containscheck.includes(branchCode)) {
            deptCell.value = `Department of CSE ALIED Branches`;

        } else {
            deptCell.value = `Department of CSE `;

        }
        deptCell.font = { size: 11 };
        deptCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 3: CIE Attendance Statement
        row++;
        ws.mergeCells(row, 1, row, COLS);
        const cieCell = ws.getCell(row, 1);
        cieCell.value = 'Continuous Internal Assessment (CIE)-I Attendance Statement';
        cieCell.font = { bold: true, size: 13 };
        cieCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;

        // Row 4-6: Info table
        row++;
        const infoStart = row;
        ws.getCell(row, 1).value = 'Branch';
        ws.getCell(row, 2).value = `BE (${branchLabel})`;
        ws.getCell(row, 3).value = '';
        ws.getCell(row, 4).value = '';
        ws.getCell(row, 5).value = 'Total Students';
        ws.getCell(row, 6).value = totalStudents;

        row++;
        ws.getCell(row, 1).value = 'Time';
        ws.getCell(row, 2).value = timeSlot;
        ws.getCell(row, 3).value = '';
        ws.getCell(row, 4).value = semLabel ? `BE ${semLabel}` : '';
        ws.getCell(row, 5).value = 'No of Students Present';
        // ws.getCell(row, 6).value = '';

        row++;
        ws.getCell(row, 1).value = 'Date';
        ws.getCell(row, 2).value = examDate;
        ws.getCell(row, 3).value = '';
        ws.getCell(row, 4).value = '';
        //Db change
        ws.getCell(row, 5).value = 'Acamdemic Year - 2025-2026';
        ws.getCell(row, 6).value = 'No of Students Absent';

        // Style info table
        for (let r = infoStart; r <= row; r++) {
            for (let c = 1; c <= COLS; c++) {
                const cell = ws.getCell(r, c);
                cell.border = thinBorder;
                cell.alignment = { vertical: 'middle', wrapText: true };
                if (c === 1 || c === 5) {
                    cell.font = { bold: true, size: 11 };
                } else {
                    cell.font = { size: 11 };
                }
            }
        }
        ws.getCell(infoStart, 6).font = { bold: true, size: 11 };

        // Blank separator
        row++;

        // Table header
        row++;
        const tableHeaders = ['S.No', 'Roll No', 'Name', 'Room', 'Subject', 'Sign'];
        tableHeaders.forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.font = { bold: true, size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
        });

        // Student rows
        for (let i = 0; i < sortedAllocs.length; i++) {
            row++;
            const a = sortedAllocs[i];
            const rollNo = a.roll_number || a.rollNumber || '';
            const studentName = a.student_name || a.studentName || '';
            const roomCode = a.room_code || a.roomCode || '';
            const subjectName = a.subject_name || a.subjectName || '';
            ws.getCell(row, 1).value = i + 1;
            ws.getCell(row, 2).value = rollNo;
            ws.getCell(row, 3).value = studentName;
            ws.getCell(row, 4).value = roomCode;
            ws.getCell(row, 5).value = subjectName;
            ws.getCell(row, 6).value = '';
            for (let c = 1; c <= COLS; c++) {
                const cell = ws.getCell(row, c);
                cell.border = thinBorder;
                cell.font = { size: 10 };
                cell.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle' };
            }
        }

        // Total row
        row++;
        ws.mergeCells(row, 1, row, 5);
        ws.getCell(row, 1).value = `Total Students: ${totalStudents}`;
        ws.getCell(row, 1).font = { bold: true, size: 11 };
        ws.getCell(row, 1).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(row, 6).value = '';
        for (let c = 1; c <= COLS; c++) {
            ws.getCell(row, c).border = thinBorder;
        }

        // Signature section
        row += 3;
        ws.getCell(row, 1).value = 'Faculty Signature:';
        ws.getCell(row, 1).font = { bold: true, size: 11 };
        ws.mergeCells(row, 2, row, 3);
        ws.getCell(row, 2).border = { bottom: { style: 'thin' } };

        ws.getCell(row, 4).value = 'HOD Signature:';
        ws.getCell(row, 4).font = { bold: true, size: 11 };
        ws.mergeCells(row, 5, row, 6);
        ws.getCell(row, 5).border = { bottom: { style: 'thin' } };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PER BRANCH MASTER ATTENDANCE SHEETS
    //  One sheet per branch (combining all sections) showing room-wise summary
    // ══════════════════════════════════════════════════════════════════════════
    if (sortedKeys.length > 0) {
        // Group sortedKeys by branch only (combine all sections)
        const masterByBranch = {};
        for (const key of sortedKeys) {
            const { roomCode, branchCode, branchSection, subjectName, allocations: ra } = allocationsByRoomBranch[key];
            const bKey = branchCode;
            if (!masterByBranch[bKey]) {
                masterByBranch[bKey] = { branchCode, entries: [] };
            }
            masterByBranch[bKey].entries.push({ roomCode, branchSection: branchSection || '', subjectName, allocations: ra });
        }

        const masterBKeys = Object.keys(masterByBranch).sort();
        for (const bKey of masterBKeys) {
            const { branchCode, entries } = masterByBranch[bKey];
            const branchLabel = branchCode;
            const sheetName = `Master-${branchCode}`.substring(0, 31);
            let finalSheetName = sheetName;
            let counter = 2;
            while (workbook.getWorksheet(finalSheetName)) {
                const sfx = `-${counter}`;
                finalSheetName = sheetName.substring(0, 31 - sfx.length) + sfx;
                counter++;
            }
            const masterSheet = workbook.addWorksheet(finalSheetName);

            masterSheet.mergeCells('A1:F1');
            masterSheet.getCell('A1').value = 'MVSR Engineering College';
            masterSheet.getCell('A1').font = { bold: true, size: 16 };
            masterSheet.getCell('A1').alignment = { horizontal: 'center' };

            masterSheet.mergeCells('A2:F2');
            masterSheet.getCell('A2').value = `CIE Consolidated Attendance — ${branchLabel}`;
            masterSheet.getCell('A2').font = { bold: true, size: 12 };
            masterSheet.getCell('A2').alignment = { horizontal: 'center' };

            masterSheet.mergeCells('A3:F3');
            const infoText = [
                examDate ? `Date: ${examDate}` : '',
                timeSlot ? `Time: ${timeSlot}` : '',
                semLabel ? `BE ${semLabel}` : '',
                yearNum ? `Year ${yearNum}` : ''
            ].filter(Boolean).join('   |   ');
            masterSheet.getCell('A3').value = infoText;
            masterSheet.getCell('A3').font = { size: 11 };
            masterSheet.getCell('A3').alignment = { horizontal: 'center' };

            const mTableRow = 5;
            const mHeaders = ['S.No', 'Room', 'Section', 'Subject', 'No. of Students', 'Roll Number Range'];
            masterSheet.getColumn(1).width = 8;
            masterSheet.getColumn(2).width = 14;
            masterSheet.getColumn(3).width = 14;
            masterSheet.getColumn(4).width = 30;
            masterSheet.getColumn(5).width = 18;
            masterSheet.getColumn(6).width = 35;

            const headerRowM = masterSheet.getRow(mTableRow);
            mHeaders.forEach((h, i) => {
                const cell = headerRowM.getCell(i + 1);
                cell.value = h;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = thinBorder;
            });

            // Sort entries by section, then room
            entries.sort((a, b) => {
                const secCmp = (a.branchSection || '').localeCompare(b.branchSection || '');
                if (secCmp !== 0) return secCmp;
                return (a.roomCode || '').localeCompare(b.roomCode || '');
            });

            let mRow = mTableRow;
            let sNo = 0;
            let grandTotal = 0;

            for (const entry of entries) {
                const sorted = entry.allocations
                    .filter(a => a.roll_number || a.rollNumber)
                    .sort((a, b) => (a.roll_number || a.rollNumber || '').localeCompare(b.roll_number || b.rollNumber || ''));
                const count = sorted.length;
                if (count === 0) continue;
                sNo++;
                grandTotal += count;

                const firstRoll = sorted[0].roll_number || sorted[0].rollNumber || '';
                const lastRoll = sorted[count - 1].roll_number || sorted[count - 1].rollNumber || '';
                const rangeStr = firstRoll === lastRoll ? firstRoll : `${firstRoll} to ${lastRoll}`;
                const sectionLabel = entry.branchSection || '-';

                mRow++;
                const dataRow = masterSheet.getRow(mRow);
                dataRow.values = [sNo, entry.roomCode, sectionLabel, entry.subjectName, count, rangeStr];
                const bgColor = sNo % 2 === 0 ? 'FFF8F9FA' : 'FFFFFFFF';
                dataRow.eachCell((cell, colNum) => {
                    if (colNum > 6) return;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = thinBorder;
                    cell.font = { size: 10 };
                });
            }

            mRow++;
            const totalRowM = masterSheet.getRow(mRow);
            masterSheet.mergeCells(mRow, 1, mRow, 4);
            totalRowM.getCell(1).value = 'GRAND TOTAL';
            totalRowM.getCell(1).font = { bold: true, size: 11 };
            totalRowM.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
            totalRowM.getCell(5).value = grandTotal;
            totalRowM.getCell(5).font = { bold: true, size: 11 };
            totalRowM.getCell(5).alignment = { horizontal: 'center' };
            totalRowM.getCell(6).value = '';
            for (let c = 1; c <= 6; c++) {
                totalRowM.getCell(c).border = thinBorder;
                totalRowM.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
            }

            mRow += 3;
            masterSheet.getCell(mRow, 1).value = 'Controller of Examinations:';
            masterSheet.getCell(mRow, 1).font = { bold: true, size: 11 };
            masterSheet.mergeCells(mRow, 2, mRow, 3);
            masterSheet.getCell(mRow, 2).border = { bottom: { style: 'thin' } };

            masterSheet.getCell(mRow, 4).value = 'Principal:';
            masterSheet.getCell(mRow, 4).font = { bold: true, size: 11 };
            masterSheet.mergeCells(mRow, 5, mRow, 6);
            masterSheet.getCell(mRow, 5).border = { bottom: { style: 'thin' } };
        }
    }

    // ── PER-ROOM GRID SHEETS ───────────────────────────────────
    for (const roomGrid of roomGrids) {
        const sheetName = `Room ${roomGrid.roomCode}`.substring(0, 31); // Excel sheet name limit
        const sheet = workbook.addWorksheet(sheetName);

        // Title row
        sheet.mergeCells(1, 1, 1, roomGrid.columns + 1);
        const titleCell = sheet.getCell(1, 1);
        titleCell.value = `Room: ${roomGrid.roomCode}  (${roomGrid.rows} rows × ${roomGrid.columns} benches)`;
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center' };

        // Header row: bench numbers
        const headerRow = sheet.getRow(2);
        headerRow.getCell(1).value = 'Row';
        headerRow.getCell(1).font = { bold: true };
        for (let c = 1; c <= roomGrid.columns; c++) {
            const cell = headerRow.getCell(c + 1);
            cell.value = `Bench ${c}`;
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
            sheet.getColumn(c + 1).width = 25;
        }
        sheet.getColumn(1).width = 8;

        // Grid rows
        for (let r = 0; r < roomGrid.grid.length; r++) {
            const excelRow = sheet.getRow(r + 3);
            excelRow.getCell(1).value = r + 1;
            excelRow.getCell(1).font = { bold: true };
            excelRow.getCell(1).alignment = { horizontal: 'center' };

            for (let c = 0; c < roomGrid.grid[r].length; c++) {
                const bench = roomGrid.grid[r][c];
                let cellText = '';
                if (bench.seatA) {
                    cellText += `A: ${bench.seatA.rollNumber} (${bench.seatA.branchCode})`;
                } else {
                    cellText += 'A: —';
                }
                if (bench.seatB !== undefined) {
                    cellText += '\n';
                    if (bench.seatB) {
                        cellText += `B: ${bench.seatB.rollNumber} (${bench.seatB.branchCode})`;
                    } else {
                        cellText += 'B: —';
                    }
                }
                const cell = excelRow.getCell(c + 2);
                cell.value = cellText;
                cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' }, bottom: { style: 'thin' },
                    left: { style: 'thin' }, right: { style: 'thin' }
                };

                // Color code: green if filled, light gray if empty
                const hasSeat = bench.seatA || bench.seatB;
                cell.fill = {
                    type: 'pattern', pattern: 'solid',
                    fgColor: { argb: hasSeat ? 'FFE8F5E9' : 'FFF5F5F5' }
                };
            }
            excelRow.height = 35;
        }
    }

    return workbook.xlsx.writeBuffer();
}

module.exports = { generateExcel };
