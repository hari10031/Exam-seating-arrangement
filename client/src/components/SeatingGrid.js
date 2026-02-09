import React from 'react';

const SUBJECT_COLORS_DEFAULT = [
    '#E3F2FD', '#FFF3E0', '#E8F5E9', '#FCE4EC',
    '#F3E5F5', '#E0F7FA', '#FFF9C4', '#F1F8E9'
];

/**
 * Visual Seating Grid Component
 * =============================
 * Renders a room's bench layout as a visual grid.
 * Color-coded by subject for easy identification.
 */
export default function SeatingGrid({ roomGrid, mode, subjectColorMap = {} }) {
    if (!roomGrid || !roomGrid.grid) return null;

    const { roomCode, rows, columns, grid } = roomGrid;

    // Build internal color map if not provided
    const colorMap = { ...subjectColorMap };
    let colorIdx = 0;
    grid.forEach(row => {
        row.forEach(bench => {
            [bench.seatA, bench.seatB].forEach(seat => {
                if (seat?.subjectName && !colorMap[seat.subjectName]) {
                    colorMap[seat.subjectName] = SUBJECT_COLORS_DEFAULT[colorIdx++ % SUBJECT_COLORS_DEFAULT.length];
                }
            });
        });
    });

    // Collect unique subjects for legend
    const subjects = [...new Set(
        grid.flatMap(row => row.flatMap(bench =>
            [bench.seatA?.subjectName, bench.seatB?.subjectName].filter(Boolean)
        ))
    )].sort();

    return (
        <div>
            <div className="room-header">
                <div className="room-label">Room: {roomCode} ({rows}×{columns})</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                    Mode: {mode} | Benches: {rows * columns}
                </div>
            </div>

            {/* Subject Legend */}
            {subjects.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {subjects.map(subj => (
                        <div key={subj} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                            <div style={{
                                width: 14, height: 14, borderRadius: 3,
                                background: colorMap[subj] || '#eee',
                                border: '1px solid #ccc'
                            }} />
                            <span>{subj}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Column Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${columns}, 1fr)`, gap: 4 }}>
                <div /> {/* empty corner */}
                {Array.from({ length: columns }, (_, c) => (
                    <div key={c} style={{
                        textAlign: 'center', fontSize: 10, fontWeight: 600,
                        padding: '4px 0', background: '#e8e8e8', borderRadius: 4
                    }}>
                        B{c + 1}
                    </div>
                ))}

                {/* Grid Rows */}
                {grid.map((row, ri) => (
                    <React.Fragment key={ri}>
                        {/* Row label */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 600, background: '#e8e8e8', borderRadius: 4
                        }}>
                            R{ri + 1}
                        </div>

                        {/* Benches */}
                        {row.map((bench, ci) => {
                            const hasSeat = bench.seatA || bench.seatB;
                            const bgA = bench.seatA ? (colorMap[bench.seatA.subjectName] || '#e8f5e9') : '#f5f5f5';
                            const bgB = bench.seatB ? (colorMap[bench.seatB.subjectName] || '#e8f5e9') : '#f5f5f5';

                            return (
                                <div key={ci} className={`bench ${hasSeat ? 'filled' : 'empty'}`}
                                    style={{ background: mode === 'DOUBLE' ? `linear-gradient(to bottom, ${bgA} 50%, ${bgB} 50%)` : bgA }}
                                    title={`Row ${ri + 1}, Bench ${ci + 1}`}
                                >
                                    {bench.seatA ? (
                                        <div className="seat-a">
                                            <span className="roll">{bench.seatA.rollNumber}</span>{' '}
                                            <span className="branch-tag">{bench.seatA.branchCode}</span>
                                        </div>
                                    ) : (
                                        <div className="seat-a" style={{ color: '#ccc' }}>A: —</div>
                                    )}

                                    {mode === 'DOUBLE' && (
                                        <>
                                            <hr style={{ margin: '2px 0', border: 'none', borderTop: '1px dashed #ccc' }} />
                                            {bench.seatB ? (
                                                <div className="seat-b">
                                                    <span className="roll">{bench.seatB.rollNumber}</span>{' '}
                                                    <span className="branch-tag">{bench.seatB.branchCode}</span>
                                                </div>
                                            ) : (
                                                <div className="seat-b" style={{ color: '#ccc' }}>B: —</div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
