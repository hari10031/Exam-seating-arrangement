/**
 * Assign rooms and run allocation on session 29, then verify section ordering.
 */
const { getDb } = require('../db/connection');
const ExamSessionModel = require('../models/ExamSession');
const { allocateSeats } = require('../engine');

const db = getDb();
const sessionId = 29;

// Assign rooms
const rooms = db.prepare("SELECT id FROM rooms ORDER BY room_code").all();
if (rooms.length > 0) {
    ExamSessionModel.assignRooms(sessionId, rooms.map(r => r.id));
    console.log(`Assigned ${rooms.length} rooms`);
}

// Run allocation
console.log('\n--- Running allocation ---');
const details = ExamSessionModel.getFullDetails(sessionId);
const result = allocateSeats(details);
console.log(`Allocation: ${result.allocations.length} seats allocated`);

// Check allocation order for CSE students
const cseAllocations = result.allocations.filter(a => a.branch_code === 'CSE');
console.log(`CSE allocations: ${cseAllocations.length}`);

// Group by section to verify contiguity 
let lastSection = null;
let transitions = [];
for (let i = 0; i < cseAllocations.length; i++) {
    const a = cseAllocations[i];
    if (a.branchSection !== lastSection) {
        transitions.push({ from: lastSection, to: a.branchSection, index: i, roll: a.roll_number });
        lastSection = a.branchSection;
    }
}
console.log('\nSection transitions:');
transitions.forEach(t => console.log(`  At index ${t.index}: ${t.from || 'start'} -> ${t.to}, roll=${t.roll}`));

// Verify each section is contiguous
const sectionOrder = transitions.map(t => t.to);
const uniqueSections = [...new Set(sectionOrder)];
if (sectionOrder.length === uniqueSections.length) {
    console.log('\n✓ PASS: Each section appears exactly once — sections are contiguous!');
} else {
    console.log('\n✗ FAIL: Sections are interleaved or repeated!');
    console.log('  Section order:', sectionOrder.join(' -> '));
}

// Show boundary rolls
console.log('\nBoundary details:');
for (const t of transitions) {
    const a = cseAllocations[t.index];
    console.log(`  Section ${t.to} starts: roll=${a.roll_number} room=${a.room_code}`);
    const nextTransitionIdx = transitions.find(tt => tt.index > t.index);
    const endIdx = nextTransitionIdx ? nextTransitionIdx.index - 1 : cseAllocations.length - 1;
    const last = cseAllocations[endIdx];
    console.log(`  Section ${t.to} ends:   roll=${last.roll_number} room=${last.room_code} (${endIdx - t.index + 1} students)`);
}

console.log('\nDone!');
