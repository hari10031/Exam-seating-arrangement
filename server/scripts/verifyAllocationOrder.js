/**
 * Verify the actual allocation order in session 28.
 */
const { getDb } = require('../db/connection');
const db = getDb();

const allocs = db.prepare(`
    SELECT sa.roll_number, sa.branch_code, sa.branch_section, 
           sa.room_id, sa.row_number, sa.column_number, r.room_code
    FROM seat_allocations sa
    JOIN rooms r ON r.id = sa.room_id
    WHERE sa.session_id = 28 AND sa.branch_code = 'CSE'
    ORDER BY r.room_code, sa.row_number, sa.column_number
`).all();

console.log('=== CSE allocation order (by room/row/col) ===');
let prevSection = null;
let sectionStart = null;
for (let i = 0; i < allocs.length; i++) {
    const a = allocs[i];
    const suffix = a.roll_number.split('-').pop();
    if (a.branch_section !== prevSection) {
        if (prevSection !== null) {
            const prevEnd = allocs[i - 1];
            console.log(`  Section ${prevSection}: ${sectionStart.roll_number.split('-').pop()} to ${prevEnd.roll_number.split('-').pop()} (${i - allocs.indexOf(sectionStart)} students) end at ${prevEnd.room_code} R${prevEnd.row_number}C${prevEnd.column_number}`);
        }
        sectionStart = a;
        prevSection = a.branch_section;
        console.log(`  --- Section ${a.branch_section} starts at ${a.room_code} R${a.row_number}C${a.column_number} ---`);
    }
}
if (sectionStart) {
    const last = allocs[allocs.length - 1];
    console.log(`  Section ${prevSection}: ${sectionStart.roll_number.split('-').pop()} to ${last.roll_number.split('-').pop()} (${allocs.length - allocs.indexOf(sectionStart)} students) end at ${last.room_code} R${last.row_number}C${last.column_number}`);
}

// Show the boundary between sections
console.log('\n=== Boundary details ===');
for (let i = 0; i < allocs.length; i++) {
    const a = allocs[i];
    const suffix = a.roll_number.split('-').pop();
    // Show last 3 and first 3 of each section change, plus around 064/065 and 128/301/308
    if (i < 3 || i >= allocs.length - 3
        || (allocs[i - 1] && allocs[i - 1].branch_section !== a.branch_section)
        || (allocs[i + 1] && allocs[i + 1].branch_section !== a.branch_section)
        || ['064', '065', '128', '129', '301', '307', '308', '314'].includes(suffix)) {
        console.log(`  [${i}] ${a.roll_number} sec=${a.branch_section} ${a.room_code} R${a.row_number}C${a.column_number}`);
    }
}

console.log('\nTotal CSE allocations:', allocs.length);
