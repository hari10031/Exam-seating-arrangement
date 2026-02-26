/**
 * XLSX IMPORT SCRIPT
 * ==================
 * Manually run this script to import student data from XLSX files.
 * 
 * Usage: npm run import
 * 
 * Place your XLSX files in the 'data/import' folder with the following columns:
 *   - Roll Number (or HT Number / Hall Ticket)
 *   - Student Name
 *   - Branch (or Department)
 * 
 * The script will:
 *   1. Read all .xlsx files from data/import/
 *   2. Parse student data (roll number, name, branch)
 *   3. Store in database with roll number mapped to name and branch
 */
const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../db/connection');
const { parseXlsxStudents } = require('../import/xlsx');
const BranchModel = require('../models/Branch');

const IMPORT_DIR = path.resolve(__dirname, '..', '..', 'data', 'import');

async function importAllXlsxFiles() {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║       XLSX STUDENT DATA IMPORT                 ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Ensure import directory exists
    if (!fs.existsSync(IMPORT_DIR)) {
        fs.mkdirSync(IMPORT_DIR, { recursive: true });
        console.log(`📁 Created import directory: ${IMPORT_DIR}`);
        console.log('   Place your .xlsx files there and run this script again.\n');
        return;
    }

    // Find all xlsx files
    const files = fs.readdirSync(IMPORT_DIR).filter(f => f.endsWith('.xlsx'));

    if (files.length === 0) {
        console.log(`📭 No .xlsx files found in: ${IMPORT_DIR}`);
        console.log('   Place your Excel files there with columns:');
        console.log('   - Roll Number (or HT Number)');
        console.log('   - Student Name');
        console.log('   - Branch (or Department)\n');
        return;
    }

    console.log(`📂 Found ${files.length} XLSX file(s) to import:\n`);

    const db = getDb();

    // Create student_master table if not exists (for storing all imported students)
    db.exec(`
        CREATE TABLE IF NOT EXISTS student_master (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            roll_number     TEXT NOT NULL UNIQUE,
            student_name    TEXT,
            branch_code     TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            source_file     TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_student_master_roll ON student_master(roll_number);
        CREATE INDEX IF NOT EXISTS idx_student_master_branch ON student_master(branch_code);
    `);

    let totalImported = 0;
    let totalSkipped = 0;

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO student_master (roll_number, student_name, branch_code, source_file)
        VALUES (?, ?, ?, ?)
    `);

    for (const file of files) {
        const filePath = path.join(IMPORT_DIR, file);
        console.log(`📄 Processing: ${file}`);

        try {
            const students = await parseXlsxStudents(filePath);
            console.log(`   Found ${students.length} student records`);

            let fileImported = 0;
            let fileSkipped = 0;

            const txn = db.transaction(() => {
                for (const student of students) {
                    try {

                        insertStmt.run(
                            student.rollNumber,
                            student.studentName,
                            student.branch,
                            file
                        );
                        fileImported++;
                    } catch (err) {
                        fileSkipped++;
                    }
                }
            });
            txn();

            console.log(`   ✅ Imported: ${fileImported}, Skipped: ${fileSkipped}\n`);
            totalImported += fileImported;
            totalSkipped += fileSkipped;

            // Also ensure branches exist
            const uniqueBranches = [...new Set(students.map(s => s.branch))];
            for (const branchCode of uniqueBranches) {
                if (branchCode) {
                    try {
                        const existing = BranchModel.getByCode(branchCode);
                        if (!existing) {
                            BranchModel.create({ branchCode, branchName: branchCode });
                            console.log(`   🏷️  Created branch: ${branchCode}`);
                        }
                    } catch (_) { }
                }
            }

        } catch (err) {
            console.log(`   ❌ Error: ${err.message}\n`);
        }
    }

    console.log('════════════════════════════════════════════════');
    console.log(`📊 TOTAL: ${totalImported} imported, ${totalSkipped} skipped`);
    console.log('════════════════════════════════════════════════\n');

    // Show how to use imported data
    const count = db.prepare('SELECT COUNT(*) as count FROM student_master').get();
    console.log(`📋 Student Master Database now contains ${count.count} records.\n`);
    console.log('To use this data when creating a session:');
    console.log('  - The system will auto-match roll numbers to names during allocation\n');
}

// Run
importAllXlsxFiles()
    .then(() => {
        closeDb();
        process.exit(0);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        closeDb();
        process.exit(1);
    });
