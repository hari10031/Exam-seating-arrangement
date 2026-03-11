/**
 * Re-import student data from the available XLSX files into student_master.
 * Run: node server/scripts/reimportStudents.js
 */
const ExcelJS = require('exceljs');
const path = require('path');
const { getDb } = require('../db/connection');
const BranchModel = require('../models/Branch');

const db = getDb();

const upsert = db.prepare(`
    INSERT INTO student_master (roll_number, student_name, branch_code, section, year, source_file)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(roll_number) DO UPDATE SET
        student_name = excluded.student_name,
        branch_code = excluded.branch_code,
        section = excluded.section,
        year = excluded.year
`);

// Get branch lookup for creating section-specific branches
const branches = BranchModel.getAll();
const branchLookup = {};
for (const b of branches) {
    const key = b.section ? `${b.branch_code.toUpperCase()}::${b.section.toUpperCase()}` : b.branch_code.toUpperCase();
    branchLookup[key] = b;
}

async function importFile(filePath, opts = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const fileName = path.basename(filePath);
    let imported = 0, skipped = 0;

    for (const ws of workbook.worksheets) {
        // Find the header row (contains "Roll No" or "S.No")
        let headerRow = opts.headerRow || 0;
        if (!headerRow) {
            for (let i = 1; i <= Math.min(10, ws.rowCount); i++) {
                const row = ws.getRow(i);
                let found = false;
                row.eachCell((cell) => {
                    const val = String(cell.value || '').toLowerCase();
                    if (val.includes('roll no') || val.includes('s.no')) found = true;
                });
                if (found) { headerRow = i; break; }
            }
        }
        if (!headerRow) { headerRow = 3; }

        // Detect columns
        const hRow = ws.getRow(headerRow);
        let colMap = { roll: 0, name: 0, branch: 0, section: 0, year: 0 };
        hRow.eachCell((cell, colNum) => {
            const val = String(cell.value || '').toLowerCase().trim();
            if (val.includes('roll no')) colMap.roll = colNum;
            else if (val.includes('name of the student') || val === 'name') colMap.name = colNum;
            else if (val === 'branch' || val.includes('branch')) colMap.branch = colNum;
            else if (val === 'section') colMap.section = colNum;
            else if (val === 'year') colMap.year = colNum;
        });

        // Fallback to known structure: col2=roll, col3=branch, col4=name, col8=section, col9=year
        if (!colMap.roll) colMap.roll = 2;
        if (!colMap.name) colMap.name = 4;
        if (!colMap.branch) colMap.branch = 3;
        if (!colMap.section) colMap.section = 8;
        if (!colMap.year) colMap.year = 9;

        console.log(`  Sheet: "${ws.name}" header=row${headerRow} cols=`, colMap);

        ws.eachRow((row, rowNum) => {
            if (rowNum <= headerRow) return;

            const rollNumber = String(row.getCell(colMap.roll).value || '').trim();
            const studentName = String(row.getCell(colMap.name).value || '').trim();
            const branchRaw = String(row.getCell(colMap.branch).value || '').trim();
            const sectionRaw = String(row.getCell(colMap.section).value || '').trim();
            const yearRaw = row.getCell(colMap.year).value;

            // Validate
            if (!rollNumber || rollNumber.length < 3 || !/\d/.test(rollNumber)) return;
            if (/\b(sem|semester|section|starts|ends|batch|year|from|to|s\.no|roll)\b/i.test(rollNumber)) return;

            const academicYear = yearRaw ? Number(yearRaw) : (opts.defaultYear || null);
            if (!academicYear) { skipped++; return; }

            // Create section-specific branch if needed
            if (branchRaw && sectionRaw) {
                const secKey = `${branchRaw.toUpperCase()}::${sectionRaw.toUpperCase()}`;
                if (!branchLookup[secKey]) {
                    try {
                        const secBranch = BranchModel.create({
                            branchCode: branchRaw,
                            branchName: branchRaw,
                            section: sectionRaw
                        });
                        branchLookup[secKey] = secBranch;
                        console.log(`    Created branch: ${branchRaw}-${sectionRaw} (id=${secBranch.id})`);
                    } catch (_) {
                        const existing = BranchModel.getByCode(branchRaw, sectionRaw);
                        if (existing) branchLookup[secKey] = existing;
                    }
                }
            }

            try {
                upsert.run(rollNumber, studentName || null, branchRaw || null, sectionRaw || '', academicYear, fileName);
                imported++;
            } catch (err) {
                skipped++;
            }
        });
    }

    console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
    return imported;
}

async function main() {
    const importDir = path.resolve(__dirname, '..', '..', 'data', 'import');
    const files = [
        'Roll List-CSE&Allied-2025-26-All Years.xlsx',
    ];

    let total = 0;
    const txn = db.transaction(async () => {
        for (const file of files) {
            const filePath = path.join(importDir, file);
            console.log(`\nImporting: ${file}`);
            try {
                const count = await importFile(filePath);
                total += count;
            } catch (err) {
                console.error(`  Error: ${err.message}`);
            }
        }
    });

    // better-sqlite3 transactions are sync, but we have async xlsx loading
    // So do it outside transaction
    for (const file of files) {
        const filePath = path.join(importDir, file);
        console.log(`\nImporting: ${file}`);
        try {
            const count = await importFile(filePath);
            total += count;
        } catch (err) {
            console.error(`  Error: ${err.message}`);
        }
    }

    // Verify
    const countResult = db.prepare('SELECT COUNT(*) as cnt FROM student_master').get();
    console.log(`\n=== Total in student_master: ${countResult.cnt} ===`);
    const byBranch = db.prepare('SELECT branch_code, section, year, COUNT(*) as cnt FROM student_master GROUP BY branch_code, section, year ORDER BY branch_code, section, year').all();
    console.log('By branch/section/year:');
    byBranch.forEach(r => console.log(`  ${r.branch_code}-${r.section || '(none)'} year=${r.year}: ${r.cnt}`));
}

main().catch(err => { console.error(err); process.exit(1); });
