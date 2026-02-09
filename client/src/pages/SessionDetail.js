import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { sessionsApi, roomsApi, branchesApi, subjectsApi } from '../api';
import SeatingGrid from '../components/SeatingGrid';

const SUBJECT_COLORS = [
    '#E3F2FD', '#FFF3E0', '#E8F5E9', '#FCE4EC',
    '#F3E5F5', '#E0F7FA', '#FFF9C4', '#F1F8E9'
];

export default function SessionDetail() {
    const { id } = useParams();
    const sessionId = Number(id);

    const [session, setSession] = useState(null);
    const [allRooms, setAllRooms] = useState([]);
    const [allBranches, setAllBranches] = useState([]);
    const [allSubjects, setAllSubjects] = useState([]);
    const [selectedRoomIds, setSelectedRoomIds] = useState([]);
    const [branchSubjectMappings, setBranchSubjectMappings] = useState([]);
    const [studentEntries, setStudentEntries] = useState([]);
    const [rollPreview, setRollPreview] = useState(null);
    const [allocResult, setAllocResult] = useState(null);
    const [roomGrids, setRoomGrids] = useState([]);
    const [report, setReport] = useState(null);
    const [activeTab, setActiveTab] = useState('config');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadSession = useCallback(async () => {
        try {
            const data = await sessionsApi.getById(sessionId);
            setSession(data);
            setSelectedRoomIds(data.rooms.map(r => r.id));
            setBranchSubjectMappings(data.branchSubjects.map(bs => ({
                branchId: bs.branch_id, subjectId: bs.subject_id
            })));
            // Build student entries from existing data grouped by branch
            if (data.students.length > 0) {
                const grouped = {};
                data.students.forEach(s => {
                    const key = `${s.branch_id}-${s.subject_id}`;
                    if (!grouped[key]) grouped[key] = { branchId: s.branch_id, subjectId: s.subject_id, rolls: [] };
                    grouped[key].rolls.push(s.roll_number);
                });
                setStudentEntries(Object.values(grouped).map(g => ({
                    branchId: g.branchId,
                    subjectId: g.subjectId,
                    rangeStart: '',
                    rangeEnd: '',
                    excludeStr: '',
                    includeStr: '',
                    savedCount: g.rolls.length
                })));
            }
        } catch (err) {
            setError(err.message);
        }
    }, [sessionId]);

    useEffect(() => {
        Promise.all([
            loadSession(),
            roomsApi.getAll().then(setAllRooms),
            branchesApi.getAll().then(setAllBranches),
            subjectsApi.getAll().then(setAllSubjects)
        ]).then(() => setLoading(false)).catch(e => {
            setError(e.message);
            setLoading(false);
        });
    }, [loadSession]);

    // ── HANDLERS ─────────────────────────────────────────────

    const toggleRoom = (roomId) => {
        setSelectedRoomIds(prev =>
            prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
        );
    };

    const saveRooms = async () => {
        setError(''); setSuccess('');
        try {
            await sessionsApi.assignRooms(sessionId, selectedRoomIds);
            setSuccess('Rooms saved!');
            loadSession();
        } catch (err) { setError(err.message); }
    };

    const addBranchSubjectMapping = () => {
        setBranchSubjectMappings([...branchSubjectMappings, { branchId: '', subjectId: '' }]);
    };

    const updateMapping = (index, field, value) => {
        const updated = [...branchSubjectMappings];
        updated[index] = { ...updated[index], [field]: Number(value) };
        setBranchSubjectMappings(updated);
    };

    const removeMapping = (index) => {
        setBranchSubjectMappings(branchSubjectMappings.filter((_, i) => i !== index));
    };

    const saveBranchSubjects = async () => {
        setError(''); setSuccess('');
        try {
            const valid = branchSubjectMappings.filter(m => m.branchId && m.subjectId);
            await sessionsApi.assignBranchSubjects(sessionId, valid);
            setSuccess('Branch-Subject mappings saved!');
            loadSession();
        } catch (err) { setError(err.message); }
    };

    const addStudentEntry = () => {
        setStudentEntries([...studentEntries, {
            branchId: '', subjectId: '', rangeStart: '', rangeEnd: '',
            excludeStr: '', includeStr: '', savedCount: 0
        }]);
    };

    const updateStudentEntry = (index, field, value) => {
        const updated = [...studentEntries];
        updated[index] = { ...updated[index], [field]: value };
        setStudentEntries(updated);
    };

    const removeStudentEntry = (index) => {
        setStudentEntries(studentEntries.filter((_, i) => i !== index));
    };

    const previewRolls = async (entry) => {
        try {
            const ranges = entry.rangeStart && entry.rangeEnd
                ? [{ start: Number(entry.rangeStart), end: Number(entry.rangeEnd) }] : [];
            const exclude = entry.excludeStr
                ? entry.excludeStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [];
            const include = entry.includeStr
                ? entry.includeStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [];
            const result = await sessionsApi.previewRolls(sessionId, { ranges, exclude, include });
            setRollPreview(result);
        } catch (err) { setError(err.message); }
    };

    const saveStudents = async () => {
        setError(''); setSuccess('');
        try {
            const entries = studentEntries.filter(e => e.branchId && e.subjectId).map(e => ({
                branchId: Number(e.branchId),
                subjectId: Number(e.subjectId),
                ranges: e.rangeStart && e.rangeEnd
                    ? [{ start: Number(e.rangeStart), end: Number(e.rangeEnd) }] : [],
                exclude: e.excludeStr
                    ? e.excludeStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [],
                include: e.includeStr
                    ? e.includeStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : []
            }));
            const result = await sessionsApi.setStudents(sessionId, entries);
            setSuccess(`Students saved! Total: ${result.count}`);
            loadSession();
        } catch (err) { setError(err.message); }
    };

    const runAllocation = async () => {
        setError(''); setSuccess('');
        try {
            const result = await sessionsApi.allocate(sessionId);
            setAllocResult(result);
            setSuccess(`Allocation complete! ${result.report.assignedCount} students assigned.`);
            loadSession();
            loadGrids();
        } catch (err) { setError(err.message); }
    };

    const loadGrids = async () => {
        try {
            const rooms = await sessionsApi.getRooms(sessionId);
            const grids = await Promise.all(
                rooms.map(r => sessionsApi.getRoomGrid(sessionId, r.id).catch(() => null))
            );
            setRoomGrids(grids.filter(Boolean));
            const rpt = await sessionsApi.getReport(sessionId).catch(() => null);
            setReport(rpt);
        } catch (err) { console.error(err); }
    };

    const exportExcel = async () => {
        try {
            const blob = await sessionsApi.exportExcel(sessionId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `seating-${session.session_name.replace(/\s+/g, '_')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) { setError(err.message); }
    };

    const exportPdf = async () => {
        try {
            const blob = await sessionsApi.exportPdf(sessionId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `seating-${session.session_name.replace(/\s+/g, '_')}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) { setError(err.message); }
    };

    // ── RENDER ───────────────────────────────────────────────

    if (loading) return <div className="loading">Loading session...</div>;
    if (!session) return <div className="alert alert-danger">Session not found</div>;

    // Build subject color map for the grid
    const subjectColorMap = {};
    allSubjects.forEach((s, i) => {
        subjectColorMap[s.subject_name] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
    });

    return (
        <div>
            <div className="page-header">
                <h2>{session.session_name}</h2>
                <div>
                    <span className="badge badge-info" style={{ marginRight: 8 }}>{session.seating_mode}</span>
                    <span className="badge badge-info" style={{ marginRight: 8 }}>{session.allocation_method || 'INTERLEAVED'}</span>
                    <span className={`badge ${session.status === 'ALLOCATED' ? 'badge-success' : 'badge-warning'}`}>
                        {session.status}
                    </span>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {/* TABS */}
            <div className="tabs">
                <div className={`tab ${activeTab === 'config' ? 'active' : ''}`}
                    onClick={() => setActiveTab('config')}>Configuration</div>
                <div className={`tab ${activeTab === 'students' ? 'active' : ''}`}
                    onClick={() => setActiveTab('students')}>Students</div>
                <div className={`tab ${activeTab === 'allocate' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('allocate'); loadGrids(); }}>Allocation & Grid</div>
                <div className={`tab ${activeTab === 'export' ? 'active' : ''}`}
                    onClick={() => setActiveTab('export')}>Export</div>
            </div>

            {/* ── TAB: CONFIGURATION ───────────────────────────────── */}
            {activeTab === 'config' && (
                <div>
                    {/* Room Selection */}
                    <div className="card">
                        <h3>Select Rooms</h3>
                        <div className="chip-list">
                            {allRooms.map(r => (
                                <div key={r.id}
                                    className={`chip ${selectedRoomIds.includes(r.id) ? 'selected' : ''}`}
                                    onClick={() => toggleRoom(r.id)}>
                                    {r.room_code} ({r.rows}×{r.columns})
                                </div>
                            ))}
                        </div>
                        {allRooms.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>No rooms created yet. Add rooms first.</p>}
                        <div className="btn-group">
                            <button className="btn btn-primary" onClick={saveRooms}>Save Room Selection</button>
                        </div>
                    </div>

                    {/* Branch-Subject Mapping */}
                    <div className="card">
                        <h3>Branch → Subject Mapping</h3>
                        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                            Each branch has exactly one subject for this exam session.
                        </p>
                        {branchSubjectMappings.map((m, i) => (
                            <div className="form-row" key={i} style={{ marginBottom: 8 }}>
                                <div className="form-group">
                                    <select value={m.branchId || ''} onChange={e => updateMapping(i, 'branchId', e.target.value)}>
                                        <option value="">— Select Branch —</option>
                                        {allBranches.map(b => (
                                            <option key={b.id} value={b.id}>{b.branch_code} – {b.branch_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <select value={m.subjectId || ''} onChange={e => updateMapping(i, 'subjectId', e.target.value)}>
                                        <option value="">— Select Subject —</option>
                                        {allSubjects.map(s => (
                                            <option key={s.id} value={s.id}>{s.subject_code} – {s.subject_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button className="btn btn-danger btn-sm" onClick={() => removeMapping(i)}
                                    style={{ alignSelf: 'center' }}>✕</button>
                            </div>
                        ))}
                        <div className="btn-group">
                            <button className="btn btn-outline" onClick={addBranchSubjectMapping}>+ Add Mapping</button>
                            <button className="btn btn-primary" onClick={saveBranchSubjects}>Save Mappings</button>
                        </div>
                    </div>

                    {/* Seating Mode */}
                    <div className="card">
                        <h3>Seating Mode</h3>
                        <div className="form-group">
                            <select value={session.seating_mode}
                                onChange={async (e) => {
                                    await sessionsApi.update(sessionId, { seatingMode: e.target.value });
                                    loadSession();
                                }}>
                                <option value="SINGLE">SINGLE — 1 student per bench</option>
                                <option value="DOUBLE">DOUBLE — 2 students per bench (different subjects)</option>
                            </select>
                        </div>
                    </div>

                    {/* Allocation Method */}
                    <div className="card">
                        <h3>Allocation Method</h3>
                        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                            <strong>INTERLEAVED:</strong> Mixes subjects/branches for maximum spacing — adjacent seats have different subjects.<br />
                            <strong>LINEAR:</strong> Contiguous blocks per branch — students from the same branch fill seats sequentially across rooms.
                        </p>
                        <div className="form-group">
                            <select value={session.allocation_method || 'INTERLEAVED'}
                                onChange={async (e) => {
                                    await sessionsApi.update(sessionId, { allocationMethod: e.target.value });
                                    loadSession();
                                }}>
                                <option value="INTERLEAVED">INTERLEAVED — mix subjects for spacing</option>
                                <option value="LINEAR">LINEAR — contiguous blocks per branch</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: STUDENTS ────────────────────────────────────── */}
            {activeTab === 'students' && (
                <div>
                    <div className="card">
                        <h3>Student Roll Number Entries</h3>
                        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                            Define roll number ranges per branch. You can exclude specific rolls or add individual ones.
                        </p>

                        {studentEntries.map((entry, i) => (
                            <div key={i} className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <strong>Entry #{i + 1}</strong>
                                    {entry.savedCount > 0 && (
                                        <span className="badge badge-success">{entry.savedCount} students</span>
                                    )}
                                    <button className="btn btn-danger btn-sm" onClick={() => removeStudentEntry(i)}>Remove</button>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Branch</label>
                                        <select value={entry.branchId || ''}
                                            onChange={e => updateStudentEntry(i, 'branchId', e.target.value)}>
                                            <option value="">— Branch —</option>
                                            {allBranches.map(b => (
                                                <option key={b.id} value={b.id}>{b.branch_code}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Subject</label>
                                        <select value={entry.subjectId || ''}
                                            onChange={e => updateStudentEntry(i, 'subjectId', e.target.value)}>
                                            <option value="">— Subject —</option>
                                            {allSubjects.map(s => (
                                                <option key={s.id} value={s.id}>{s.subject_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Range Start</label>
                                        <input type="number" value={entry.rangeStart}
                                            onChange={e => updateStudentEntry(i, 'rangeStart', e.target.value)}
                                            placeholder="e.g. 101" />
                                    </div>
                                    <div className="form-group">
                                        <label>Range End</label>
                                        <input type="number" value={entry.rangeEnd}
                                            onChange={e => updateStudentEntry(i, 'rangeEnd', e.target.value)}
                                            placeholder="e.g. 130" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Exclude (comma-separated)</label>
                                        <input value={entry.excludeStr}
                                            onChange={e => updateStudentEntry(i, 'excludeStr', e.target.value)}
                                            placeholder="e.g. 115, 120" />
                                    </div>
                                    <div className="form-group">
                                        <label>Include (extra rolls)</label>
                                        <input value={entry.includeStr}
                                            onChange={e => updateStudentEntry(i, 'includeStr', e.target.value)}
                                            placeholder="e.g. 199, 200" />
                                    </div>
                                </div>
                                <button className="btn btn-outline btn-sm" onClick={() => previewRolls(entry)}>
                                    Preview Roll List
                                </button>
                            </div>
                        ))}

                        {rollPreview && (
                            <div className="card" style={{ background: '#fff9c4', boxShadow: 'none' }}>
                                <strong>Preview: {rollPreview.count} students</strong>
                                <div className="roll-preview">
                                    {rollPreview.rolls.map(r => (
                                        <span key={r} className="roll-chip">{r}</span>
                                    ))}
                                </div>
                                <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }}
                                    onClick={() => setRollPreview(null)}>Close Preview</button>
                            </div>
                        )}

                        <div className="btn-group">
                            <button className="btn btn-outline" onClick={addStudentEntry}>+ Add Entry</button>
                            <button className="btn btn-primary" onClick={saveStudents}>Save All Students</button>
                        </div>
                    </div>

                    {/* Current student summary */}
                    {session.students && session.students.length > 0 && (
                        <div className="card">
                            <h3>Current Students ({session.students.length})</h3>
                            <div className="table-wrapper" style={{ maxHeight: 300, overflowY: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr><th>Roll</th><th>Branch</th><th>Subject</th></tr>
                                    </thead>
                                    <tbody>
                                        {session.students.map(s => (
                                            <tr key={s.id}>
                                                <td><strong>{s.roll_number}</strong></td>
                                                <td>{s.branch_code}</td>
                                                <td>{s.subject_name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: ALLOCATION & GRID ───────────────────────────── */}
            {activeTab === 'allocate' && (
                <div>
                    <div className="card">
                        <h3>Run Allocation</h3>
                        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                            Ensure rooms, branch-subject mappings, and students are configured before running.
                        </p>
                        <button className="btn btn-success" onClick={runAllocation}>
                            Run Seat Allocation
                        </button>
                    </div>

                    {/* Validation Report */}
                    {(allocResult || report) && (
                        <div className="card">
                            <h3>Allocation Report</h3>
                            <div className="report-grid">
                                <div className="report-stat">
                                    <div className="number">{(allocResult?.report || report)?.totalStudents || 0}</div>
                                    <div className="label">Total Students</div>
                                </div>
                                <div className="report-stat">
                                    <div className="number">{(allocResult?.report || report)?.total_seats || (allocResult?.report || report)?.totalSeats || 0}</div>
                                    <div className="label">Total Seats</div>
                                </div>
                                <div className="report-stat">
                                    <div className="number" style={{ color: 'var(--success)' }}>
                                        {(allocResult?.report || report)?.assignedCount || (allocResult?.report || report)?.assigned_count || 0}
                                    </div>
                                    <div className="label">Assigned</div>
                                </div>
                                <div className="report-stat">
                                    <div className="number" style={{ color: (allocResult?.report || report)?.unassignedCount > 0 || (allocResult?.report || report)?.unassigned_count > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                        {(allocResult?.report || report)?.unassignedCount || (allocResult?.report || report)?.unassigned_count || 0}
                                    </div>
                                    <div className="label">Unassigned</div>
                                </div>
                            </div>

                            {allocResult?.validation && (
                                <div>
                                    {allocResult.validation.errors.length > 0 && (
                                        <div className="alert alert-danger">
                                            <strong>Errors:</strong>
                                            <ul>{allocResult.validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                                        </div>
                                    )}
                                    {allocResult.validation.warnings.length > 0 && (
                                        <div className="alert alert-warning">
                                            <strong>Warnings:</strong>
                                            <ul>{allocResult.validation.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                        </div>
                                    )}
                                    {allocResult.validation.valid && allocResult.validation.errors.length === 0 && (
                                        <div className="alert alert-success">All validation checks passed!</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Room Grids */}
                    {roomGrids.map(rg => (
                        <div key={rg.roomId} className="card">
                            <SeatingGrid roomGrid={rg} mode={session.seating_mode} subjectColorMap={subjectColorMap} />
                        </div>
                    ))}
                </div>
            )}

            {/* ── TAB: EXPORT ──────────────────────────────────────── */}
            {activeTab === 'export' && (
                <div>
                    <div className="card">
                        <h3>Export Seating Arrangement</h3>
                        {session.status !== 'ALLOCATED' ? (
                            <div className="alert alert-warning">
                                Run allocation first before exporting.
                            </div>
                        ) : (
                            <div className="btn-group">
                                <button className="btn btn-primary" onClick={exportExcel}>
                                    Download Excel (.xlsx)
                                </button>
                                <button className="btn btn-success" onClick={exportPdf}>
                                    Download PDF
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
