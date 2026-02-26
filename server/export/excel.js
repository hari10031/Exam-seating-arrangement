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
async function generateExcel({ sessionName, allocations, roomGrids, report, roomSummary = [] }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Exam Seating System';
    workbook.created = new Date();

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

    // ── PER-ROOM, PER-BRANCH ATTENDANCE SHEETS (Name, Roll, Signature) ─────
    // Get allocations grouped by room and then by branch
    const allocationsByRoomBranch = {};
    for (const a of allocations) {
        const roomCode = a.room_code || a.roomCode || 'Unknown';
        const branchCode = a.branch_code || a.branchCode || 'Unknown';
        const key = `${roomCode}|||${branchCode}`;
        if (!allocationsByRoomBranch[key]) {
            allocationsByRoomBranch[key] = {
                roomCode,
                branchCode,
                allocations: []
            };
        }
        allocationsByRoomBranch[key].allocations.push(a);
    }

    // Sort keys by room then branch
    const sortedKeys = Object.keys(allocationsByRoomBranch).sort((a, b) => {
        const [roomA, branchA] = a.split('|||');
        const [roomB, branchB] = b.split('|||');
        if (roomA !== roomB) return roomA.localeCompare(roomB);
        return branchA.localeCompare(branchB);
    });

    for (const key of sortedKeys) {
        const { roomCode, branchCode, allocations: roomBranchAllocations } = allocationsByRoomBranch[key];

        // Sheet name: "RoomCode-Branch" (max 31 chars for Excel)
        const attendanceSheetName = `${roomCode}-${branchCode}`.substring(0, 31);
        const attendanceSheet = workbook.addWorksheet(attendanceSheetName);

        // Set columns
        attendanceSheet.columns = [
            { header: 'S.No', key: 'sNo', width: 8 },
            { header: 'Roll Number', key: 'rollNumber', width: 20 },
            { header: 'Student Name', key: 'studentName', width: 30 },
            { header: 'Signature', key: 'signature', width: 25 }
        ];

        // Title row (merge and style)
        attendanceSheet.insertRow(1, []);
        attendanceSheet.mergeCells('A1:D1');
        const titleCell = attendanceSheet.getCell('A1');
        titleCell.value = `Room: ${roomCode} | Branch: ${branchCode} - Attendance Sheet`;
        titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
        attendanceSheet.getRow(1).height = 25;

        // Style header row (now row 2)
        const headerRow = attendanceSheet.getRow(2);
        headerRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' }
            };
        });

        // Sort allocations by roll number
        const sortedAllocations = roomBranchAllocations
            .filter(a => a.roll_number || a.rollNumber)
            .sort((a, b) => {
                const rollA = a.roll_number || a.rollNumber || '';
                const rollB = b.roll_number || b.rollNumber || '';
                return rollA.localeCompare(rollB);
            });

        // Add data rows
        let sNo = 1;
        for (const alloc of sortedAllocations) {
            const row = attendanceSheet.addRow({
                sNo: sNo++,
                rollNumber: alloc.roll_number || alloc.rollNumber || '',
                studentName: alloc.student_name || alloc.studentName || '',
                signature: ''  // Empty signature column
            });

            // Style data row
            const bgColor = sNo % 2 === 0 ? 'FFF8F9FA' : 'FFFFFFFF';
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' }, bottom: { style: 'thin' },
                    left: { style: 'thin' }, right: { style: 'thin' }
                };
            });
            // Left-align student name
            row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
            row.height = 22;
        }

        // Footer row with total count
        const footerRowNum = attendanceSheet.rowCount + 1;
        attendanceSheet.mergeCells(`A${footerRowNum}:C${footerRowNum}`);
        const footerCell = attendanceSheet.getCell(`A${footerRowNum}`);
        footerCell.value = `Total Students: ${sortedAllocations.length}`;
        footerCell.font = { bold: true };
        footerCell.alignment = { horizontal: 'right' };
        footerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
        footerCell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
        };
        attendanceSheet.getCell(`D${footerRowNum}`).border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
        };
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
