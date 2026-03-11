/**
 * ============================================================
 *  PDF EXPORT
 * ============================================================
 *  Generates a PDF seating chart with one page per room.
 *  Each page shows:
 *  - Room header (code, dimensions)
 *  - Grid of benches with student info
 *  - Color coding by subject
 * ============================================================
 */
const PDFDocument = require('pdfkit');

// Subject color palette (pastel) for visual distinction
const SUBJECT_COLORS = [
    '#E3F2FD', '#FFF3E0', '#E8F5E9', '#FCE4EC',
    '#F3E5F5', '#E0F7FA', '#FFF9C4', '#F1F8E9',
    '#FFEBEE', '#E8EAF6'
];

/**
 * Generate a PDF buffer with seating charts.
 *
 * @param {Object} params
 * @param {string} params.sessionName
 * @param {string} params.mode - 'SINGLE' | 'DOUBLE'
 * @param {Array}  params.roomGrids - Array of { roomCode, rows, columns, grid }
 * @param {Object} params.report
 * @returns {Promise<Buffer>}
 */
async function generatePDF({ sessionName, mode, roomGrids, report, roomSummary = [] }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: { top: 40, bottom: 40, left: 40, right: 40 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Build a subject → color map
        const subjects = new Set();
        for (const rg of roomGrids) {
            for (const row of rg.grid) {
                for (const bench of row) {
                    if (bench.seatA) subjects.add(bench.seatA.subjectName);
                    if (bench.seatB) subjects.add(bench.seatB.subjectName);
                }
            }
        }
        const subjectList = Array.from(subjects).sort();
        const subjectColorMap = {};
        subjectList.forEach((s, i) => {
            subjectColorMap[s] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
        });

        // ── COVER PAGE ───────────────────────────────────────────
        doc.fontSize(18).font('Helvetica-Bold')
            .text('MVSE Engineering College', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(24).font('Helvetica-Bold')
            .text('EXAM SEATING ARRANGEMENT', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(16).font('Helvetica')
            .text(sessionName, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12)
            .text(`Mode: ${mode}`, { align: 'center' })
            .text(`Total Students: ${report.totalStudents}  |  Assigned: ${report.assignedCount}  |  Unassigned: ${report.unassignedCount}`, { align: 'center' });

        doc.moveDown(1);

        // Subject legend
        doc.fontSize(11).font('Helvetica-Bold').text('Subject Legend:', { align: 'left' });
        doc.moveDown(0.3);
        for (const [subj, color] of Object.entries(subjectColorMap)) {
            const y = doc.y;
            doc.rect(doc.x, y, 12, 12).fill(color).stroke('#999');
            doc.fill('#000').fontSize(10).font('Helvetica')
                .text(`  ${subj}`, doc.x + 16, y + 1);
            doc.moveDown(0.2);
        }

        // ── ROOM PAGES ───────────────────────────────────────────
        for (const roomGrid of roomGrids) {
            doc.addPage();
            renderRoomPage(doc, roomGrid, mode, subjectColorMap);
        }

        // ── ROOM-WISE SUMMARY PAGES ─────────────────────────────
        if (roomSummary && roomSummary.length > 0) {
            doc.addPage();
            renderSummaryPages(doc, roomSummary, sessionName, subjectColorMap);
        }

        doc.end();
    });
}

function renderRoomPage(doc, roomGrid, mode, colorMap) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // Title
    doc.fontSize(16).font('Helvetica-Bold')
        .text(`Room: ${roomGrid.roomCode}`, { align: 'center' });
    doc.fontSize(10).font('Helvetica')
        .text(`${roomGrid.rows} rows × ${roomGrid.columns} benches  |  Mode: ${mode}`, { align: 'center' });
    doc.moveDown(0.5);

    const startY = doc.y;
    const availableHeight = pageHeight - (startY - doc.page.margins.top) - 20;

    // Calculate cell dimensions
    const colCount = roomGrid.columns;
    const rowCount = roomGrid.rows;
    const labelWidth = 35; // "Row X" label
    const cellWidth = Math.min((pageWidth - labelWidth) / colCount, 110);
    const cellHeight = Math.min(availableHeight / (rowCount + 1), mode === 'DOUBLE' ? 45 : 30);
    const tableWidth = labelWidth + cellWidth * colCount;
    const startX = doc.page.margins.left + (pageWidth - tableWidth) / 2;

    // Header row: bench numbers
    let x = startX + labelWidth;
    let y = startY;
    for (let c = 1; c <= colCount; c++) {
        doc.rect(x, y, cellWidth, 18).fill('#2E86AB').stroke('#1a5276');
        doc.fill('#fff').fontSize(8).font('Helvetica-Bold')
            .text(`Bench ${c}`, x + 2, y + 4, { width: cellWidth - 4, align: 'center' });
        x += cellWidth;
    }
    y += 18;

    // Grid rows
    for (let r = 0; r < rowCount; r++) {
        x = startX;

        // Row label
        doc.rect(x, y, labelWidth, cellHeight).fill('#E8E8E8').stroke('#999');
        doc.fill('#333').fontSize(8).font('Helvetica-Bold')
            .text(`R${r + 1}`, x + 2, y + cellHeight / 2 - 5, { width: labelWidth - 4, align: 'center' });
        x += labelWidth;

        for (let c = 0; c < colCount; c++) {
            const bench = roomGrid.grid[r][c];
            let bgColor = '#F5F5F5';

            // Determine background color
            if (bench.seatA && bench.seatA.subjectName) {
                bgColor = colorMap[bench.seatA.subjectName] || '#F5F5F5';
            }

            doc.rect(x, y, cellWidth, cellHeight).fill(bgColor).stroke('#999');

            // Seat A text
            const textA = bench.seatA
                ? `A: ${bench.seatA.rollNumber} (${bench.seatA.branchCode})`
                : 'A: —';

            doc.fill('#333').fontSize(7).font('Helvetica')
                .text(textA, x + 2, y + 3, { width: cellWidth - 4, align: 'center' });

            // Seat B text (only in DOUBLE mode)
            if (mode === 'DOUBLE') {
                const textB = bench.seatB
                    ? `B: ${bench.seatB.rollNumber} (${bench.seatB.branchCode})`
                    : 'B: —';

                // If seat B has a different subject, draw a split background
                if (bench.seatB && bench.seatB.subjectName && bench.seatB.subjectName !== bench.seatA?.subjectName) {
                    const bColor = colorMap[bench.seatB.subjectName] || bgColor;
                    doc.rect(x, y + cellHeight / 2, cellWidth, cellHeight / 2).fill(bColor).stroke('#999');
                }

                doc.fill('#333').fontSize(7).font('Helvetica')
                    .text(textB, x + 2, y + cellHeight / 2 + 2, { width: cellWidth - 4, align: 'center' });
            }

            x += cellWidth;
        }
        y += cellHeight;
    }
}

/**
 * Render room-wise summary table pages.
 * Format matches university seating documents:
 * S.No | Branch | H.T. Numbers (range) | Room Number | No. of Students
 * Grouped by subject with subject headers.
 */
function renderSummaryPages(doc, roomSummary, sessionName, colorMap) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // Title
    doc.fontSize(16).font('Helvetica-Bold')
        .text('ROOM-WISE ALLOCATION SUMMARY', { align: 'center' });
    doc.fontSize(11).font('Helvetica')
        .text(sessionName, { align: 'center' });
    doc.moveDown(0.8);

    // Table column widths
    const colWidths = {
        sNo: 40,
        branch: 80,
        htNumbers: pageWidth - 40 - 80 - 120 - 80,  // remaining space
        room: 120,
        count: 80
    };
    const startX = doc.page.margins.left;
    const rowHeight = 22;

    // Draw table header
    let y = doc.y;

    function drawTableHeader() {
        const hdrY = doc.y;
        const cols = [
            { label: 'S.No', width: colWidths.sNo },
            { label: 'Branch', width: colWidths.branch },
            { label: 'H.T. Numbers', width: colWidths.htNumbers },
            { label: 'Room Number', width: colWidths.room },
            { label: 'No. of Students', width: colWidths.count }
        ];

        let x = startX;
        for (const col of cols) {
            doc.rect(x, hdrY, col.width, rowHeight).fill('#2E86AB').stroke('#1a5276');
            doc.fill('#fff').fontSize(9).font('Helvetica-Bold')
                .text(col.label, x + 4, hdrY + 6, { width: col.width - 8, align: 'center' });
            x += col.width;
        }
        doc.y = hdrY + rowHeight;
    }

    function checkPageBreak(neededHeight) {
        const bottomLimit = doc.page.height - doc.page.margins.bottom;
        if (doc.y + neededHeight > bottomLimit) {
            doc.addPage();
            doc.fontSize(10).font('Helvetica')
                .text('ROOM-WISE ALLOCATION SUMMARY (continued)', { align: 'center' });
            doc.moveDown(0.4);
            drawTableHeader();
        }
    }

    drawTableHeader();

    // Group summary rows by subject for section headers
    let currentSubject = '';
    let totalStudents = 0;

    for (const row of roomSummary) {
        // Subject section header
        if (row.subjectName !== currentSubject) {
            currentSubject = row.subjectName;
            checkPageBreak(rowHeight + rowHeight); // subject header + at least one data row

            const subjY = doc.y;
            const subjColor = colorMap[currentSubject] || '#E8F5E9';
            doc.rect(startX, subjY, pageWidth, rowHeight).fill(subjColor).stroke('#999');
            doc.fill('#333').fontSize(10).font('Helvetica-Bold')
                .text(`Subject: ${currentSubject}`, startX + 8, subjY + 5, { width: pageWidth - 16 });
            doc.y = subjY + rowHeight;
        }

        checkPageBreak(rowHeight);

        // Data row
        const dataY = doc.y;
        const bgColor = totalStudents % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
        const cols = [
            { value: String(row.sNo), width: colWidths.sNo },
            { value: row.branchCode, width: colWidths.branch },
            { value: row.rollRange, width: colWidths.htNumbers },
            { value: row.roomCode, width: colWidths.room },
            { value: String(row.count), width: colWidths.count }
        ];

        let x = startX;
        for (const col of cols) {
            doc.rect(x, dataY, col.width, rowHeight).fill(bgColor).stroke('#CCC');
            doc.fill('#333').fontSize(8).font('Helvetica')
                .text(col.value, x + 4, dataY + 6, { width: col.width - 8, align: 'center' });
            x += col.width;
        }

        doc.y = dataY + rowHeight;
        totalStudents += row.count;
    }

    // Total row
    checkPageBreak(rowHeight);
    const totalY = doc.y;
    const totalWidth = colWidths.sNo + colWidths.branch + colWidths.htNumbers + colWidths.room;
    doc.rect(startX, totalY, totalWidth, rowHeight).fill('#E8E8E8').stroke('#999');
    doc.fill('#333').fontSize(10).font('Helvetica-Bold')
        .text('TOTAL', startX + 8, totalY + 5, { width: totalWidth - 16, align: 'right' });
    doc.rect(startX + totalWidth, totalY, colWidths.count, rowHeight).fill('#E8E8E8').stroke('#999');
    doc.fill('#333').fontSize(10).font('Helvetica-Bold')
        .text(String(totalStudents), startX + totalWidth + 4, totalY + 5, { width: colWidths.count - 8, align: 'center' });
    doc.y = totalY + rowHeight;
}

module.exports = { generatePDF };
