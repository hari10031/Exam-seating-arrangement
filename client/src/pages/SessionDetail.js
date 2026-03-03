import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { sessionsApi, roomsApi, branchesApi, subjectsApi, configApi } from '../api';
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
    const [allocResult, setAllocResult] = useState(null);
    const [roomGrids, setRoomGrids] = useState([]);
    const [report, setReport] = useState(null);
    const [activeTab, setActiveTab] = useState('config');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Multi-year branch-subject picker state
    const [configuredYears, setConfiguredYears] = useState([]);
    const [pickerYear, setPickerYear] = useState('');
    const [pickerBranches, setPickerBranches] = useState([]);
    const [pickerSubjects, setPickerSubjects] = useState({});   // { branchId: [...subjects] }
    const [pickerBranchId, setPickerBranchId] = useState('');
    const [pickerSubjectId, setPickerSubjectId] = useState('');
    const [dbStudents, setDbStudents] = useState({});            // { "year-branchId": [...students] }

    const loadSession = useCallback(async () => {
        try {
            const data = await sessionsApi.getById(sessionId);
            setSession(data);
            setSelectedRoomIds(data.rooms.map(r => r.id));
            setBranchSubjectMappings(data.branchSubjects.map(bs => ({
                branchId: bs.branch_id, subjectId: bs.subject_id,
                branchCode: bs.branch_code, subjectName: bs.subject_name,
                subjectCode: bs.subject_code
            })));
            // Group saved students by branch+subject
            const grouped = {};
            data.students.forEach(s => {
                const key = `${s.branch_id}-${s.subject_id}`;
                if (!grouped[key]) grouped[key] = {
                    branchId: s.branch_id, subjectId: s.subject_id,
                    branchCode: s.branch_code || '', subjectName: s.subject_name || '',
                    rolls: []
                };
                grouped[key].rolls.push(s.roll_number);
            });
            // Build entries from ALL branch-subject mappings (not just those with saved students)
            if (data.branchSubjects.length > 0) {
                const newEntries = data.branchSubjects.map(bs => {
                    const key = `${bs.branch_id}-${bs.subject_id}`;
                    const saved = grouped[key];
                    return {
                        branchId: bs.branch_id, subjectId: bs.subject_id,
                        branchCode: bs.branch_code, subjectName: bs.subject_name,
                        excludeStr: '', includeStr: '',
                        savedCount: saved ? saved.rolls.length : 0, useDb: true,
                        year: data.year || ''
                    };
                });
                setStudentEntries(newEntries);
                // Pre-load dbStudents for each branch so Students tab shows counts/warnings
                const yr = data.year || '';
                if (yr) {
                    const uniqueBranches = [...new Set(newEntries.map(e => e.branchId))];
                    Promise.all(uniqueBranches.map(async (bid) => {
                        const k = `${yr}-${bid}`;
                        try {
                            const studs = await configApi.getStudents({ year: yr, branchId: bid });
                            return { k, studs };
                        } catch { return { k, studs: [] }; }
                    })).then(results => {
                        const updates = {};
                        results.forEach(r => { updates[r.k] = r.studs; });
                        setDbStudents(prev => ({ ...prev, ...updates }));
                    });
                }
            }
        } catch (err) {
            setError(err.message);
        }
    }, [sessionId]);

    // Load configured years once
    useEffect(() => {
        configApi.getConfiguredYears().then(setConfiguredYears).catch(() => { });
    }, []);

    // When picker year changes, load branches for that year
    useEffect(() => {
        if (!pickerYear) { setPickerBranches([]); setPickerSubjects({}); setPickerBranchId(''); return; }
        configApi.getBranchesForYear(pickerYear).then(setPickerBranches).catch(() => setPickerBranches([]));
    }, [pickerYear]);

    // When picker branch changes, load subjects for that year+branch
    useEffect(() => {
        if (!pickerYear || !pickerBranchId) return;
        if (pickerSubjects[pickerBranchId]) return; // already loaded
        configApi.getYearSubjects(pickerYear, pickerBranchId).then(subjects => {
            setPickerSubjects(prev => ({ ...prev, [pickerBranchId]: subjects }));
        }).catch(() => { });
    }, [pickerYear, pickerBranchId, pickerSubjects]);

    // Load DB students for a branch
    const loadDbStudentsForBranch = useCallback(async (year, branchId) => {
        const key = `${year}-${branchId}`;
        if (dbStudents[key]) return dbStudents[key];
        try {
            const data = await configApi.getStudents({ year, branchId });
            setDbStudents(prev => ({ ...prev, [key]: data }));
            return data;
        } catch (err) { console.error(err); return []; }
    }, [dbStudents]);

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

    // Add a single subject from the picker dropdown
    const addSelectedSubject = () => {
        if (!pickerBranchId || !pickerSubjectId || !currentPickerBranch) return;
        const subject = currentPickerSubs.find(s => String(s.subject_id) === String(pickerSubjectId));
        if (!subject) return;
        const alreadyExists = branchSubjectMappings.some(
            m => Number(m.branchId) === currentPickerBranch.id && Number(m.subjectId) === subject.subject_id
        );
        if (alreadyExists) return;
        setBranchSubjectMappings(prev => [...prev, {
            branchId: currentPickerBranch.id, subjectId: subject.subject_id,
            branchCode: currentPickerBranch.branch_code, subjectName: subject.subject_name,
            subjectCode: subject.subject_code, year: pickerYear
        }]);
        setPickerSubjectId('');
    };

    const removeMapping = (index) => {
        setBranchSubjectMappings(branchSubjectMappings.filter((_, i) => i !== index));
    };

    const saveBranchSubjects = async () => {
        setError(''); setSuccess('');
        try {
            const valid = branchSubjectMappings.filter(m => m.branchId && m.subjectId);
            await sessionsApi.assignBranchSubjects(sessionId, valid);
            setSuccess('Branch-Subject mappings saved! Auto-populating students...');
            await loadSession();
            // Auto-populate student entries
            await autoPopulateStudents(valid);
        } catch (err) { setError(err.message); }
    };

    // Auto-populate student entries from branch-subject mappings
    const autoPopulateStudents = async (mappings) => {
        const entries = [];
        for (const m of mappings) {
            const year = m.year || pickerYear || configuredYears[0];
            if (year) {
                try { await loadDbStudentsForBranch(year, m.branchId); } catch (e) { }
            }
            entries.push({
                branchId: m.branchId, subjectId: m.subjectId,
                branchCode: m.branchCode || '', subjectName: m.subjectName || '',
                excludeStr: '', includeStr: '',
                savedCount: 0, useDb: true, year: m.year || year
            });
        }
        setStudentEntries(entries);
    };

    const updateStudentEntry = (index, field, value) => {
        const updated = [...studentEntries];
        updated[index] = { ...updated[index], [field]: value };
        setStudentEntries(updated);
    };

    const saveStudents = async () => {
        setError(''); setSuccess('');
        try {
            const entriesWithRolls = [];
            const branchCounts = [];
            const emptyBranches = [];
            // Fetch students fresh for each unique year-branch combo
            const fetchedStudents = {};
            for (const e of studentEntries) {
                if (!e.branchId || !e.subjectId) continue;
                const year = e.year || pickerYear || configuredYears[0];
                const key = `${year}-${e.branchId}`;
                if (!fetchedStudents[key]) {
                    try {
                        fetchedStudents[key] = await configApi.getStudents({ year, branchId: e.branchId });
                    } catch (fetchErr) {
                        console.error(`Failed to fetch students for year=${year} branch=${e.branchId}:`, fetchErr);
                        fetchedStudents[key] = [];
                    }
                }
                const students = fetchedStudents[key] || [];
                const branchLabel = e.branchCode || `Branch ${e.branchId}`;
                if (students.length === 0) {
                    emptyBranches.push(branchLabel);
                } else {
                    branchCounts.push(`${branchLabel}: ${students.length}`);
                }
                entriesWithRolls.push({
                    branchId: Number(e.branchId), subjectId: Number(e.subjectId),
                    rollNumbers: students.map(s => s.roll_number),
                    exclude: e.excludeStr ? e.excludeStr.split(',').map(s => s.trim()).filter(Boolean) : [],
                    include: e.includeStr ? e.includeStr.split(',').map(s => s.trim()).filter(Boolean) : []
                });
            }
            const result = await sessionsApi.setStudentsFromDb(sessionId, entriesWithRolls);
            let msg = `Students saved! Total: ${result.count}`;
            if (branchCounts.length > 0) msg += ` (${branchCounts.join(', ')})`;
            if (emptyBranches.length > 0) {
                setError(`No students found in database for: ${emptyBranches.join(', ')}. Please import student data for these branches.`);
            }
            setSuccess(msg);
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

    // Build computed helpers for rendering
    const currentPickerSubs = pickerBranchId ? (pickerSubjects[pickerBranchId] || []) : [];
    const currentPickerBranch = pickerBranches.find(b => b.id === Number(pickerBranchId));

    // Group selected mappings by branch for display
    const selectedByBranch = {};
    branchSubjectMappings.forEach(m => {
        const bCode = m.branchCode || allBranches.find(b => b.id === Number(m.branchId))?.branch_code || `Branch ${m.branchId}`;
        if (!selectedByBranch[bCode]) selectedByBranch[bCode] = [];
        selectedByBranch[bCode].push(m);
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

                    {/* Branch-Subject Mapping — multi-year support */}
                    <div className="card">
                        <h3>Branch → Subject Mapping</h3>
                        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                            Select a year, then a branch to see available subjects. You can add subjects from multiple years.
                        </p>

                        {/* Year + Branch picker */}
                        <div className="form-row" style={{ marginBottom: 16 }}>
                            <div className="form-group">
                                <label>Year</label>
                                <select value={pickerYear} onChange={e => { setPickerYear(e.target.value); setPickerBranchId(''); }}>
                                    <option value="">— Select Year —</option>
                                    {configuredYears.length > 0
                                        ? configuredYears.map(y => (
                                            <option key={y} value={y}>Year {y}</option>
                                        ))
                                        : [1, 2, 3, 4].map(y => (
                                            <option key={y} value={y}>Year {y}</option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Branch</label>
                                <select value={pickerBranchId} onChange={e => setPickerBranchId(e.target.value)} disabled={!pickerYear}>
                                    <option value="">— Select Branch —</option>
                                    {pickerBranches.map(b => (
                                        <option key={b.id} value={b.id}>{b.branch_code} — {b.branch_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Show subject dropdown for selected year+branch */}
                        {pickerBranchId && currentPickerBranch && (
                            <div style={{
                                background: '#f8f9fb', borderRadius: 8, padding: 16, marginBottom: 16,
                                border: '1px solid #e0e0e0'
                            }}>
                                <div style={{
                                    fontWeight: 700, fontSize: 14, color: '#1a73e8', marginBottom: 8,
                                    borderBottom: '2px solid #1a73e8', paddingBottom: 4
                                }}>
                                    Year {pickerYear} — {currentPickerBranch.branch_code} — {currentPickerBranch.branch_name}
                                    <span style={{ fontWeight: 400, color: '#666', fontSize: 12, marginLeft: 8 }}>
                                        ({currentPickerSubs.length} subjects)
                                    </span>
                                </div>
                                {currentPickerSubs.length > 0 ? (
                                    <div className="form-row" style={{ alignItems: 'flex-end' }}>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label>Subject</label>
                                            <select value={pickerSubjectId}
                                                onChange={e => setPickerSubjectId(e.target.value)}>
                                                <option value="">— Select Subject —</option>
                                                {currentPickerSubs
                                                    .filter(s => !branchSubjectMappings.some(
                                                        m => Number(m.branchId) === currentPickerBranch.id && Number(m.subjectId) === s.subject_id
                                                    ))
                                                    .map(s => (
                                                        <option key={s.subject_id} value={s.subject_id}>
                                                            {s.subject_name}
                                                            {s.subject_type !== 'REGULAR' ? ` (${s.subject_type})` : ''}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                        <div style={{ marginBottom: 16 }}>
                                            <button className="btn btn-primary btn-sm" onClick={addSelectedSubject}
                                                disabled={!pickerSubjectId}>
                                                + Add
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p style={{ color: '#999', fontSize: 13 }}>No subjects configured for this branch in Year {pickerYear}.</p>
                                )}
                            </div>
                        )}

                        {/* Selected mappings summary */}
                        {branchSubjectMappings.length > 0 && (
                            <div style={{
                                background: '#f0f4ff', borderRadius: 8, padding: 16, marginBottom: 12,
                                border: '1px solid #c8d6f0'
                            }}>
                                <h4 style={{ marginBottom: 8, fontSize: 14 }}>
                                    Selected Mappings ({branchSubjectMappings.length})
                                </h4>
                                {Object.entries(selectedByBranch).map(([bCode, subs]) => (
                                    <div key={bCode} style={{ marginBottom: 8 }}>
                                        <strong style={{ color: '#1a73e8', fontSize: 13 }}>{bCode}</strong>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                            {subs.map((m, i) => (
                                                <span key={i} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '2px 8px', borderRadius: 4,
                                                    background: '#e8f5e9', border: '1px solid #a5d6a7',
                                                    fontSize: 11
                                                }}>
                                                    {m.subjectName || m.subjectCode || `Subject ${m.subjectId}`}
                                                    <span style={{ cursor: 'pointer', color: '#c62828', fontWeight: 700, marginLeft: 2 }}
                                                        onClick={() => {
                                                            const idx = branchSubjectMappings.indexOf(m);
                                                            if (idx !== -1) removeMapping(idx);
                                                        }}>×</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {branchSubjectMappings.length === 0 && !pickerBranchId && (
                            <p style={{ color: '#999', fontSize: 13 }}>
                                No mappings selected yet. Pick a year and branch above to add subjects.
                            </p>
                        )}

                        <div className="btn-group" style={{ marginTop: 8 }}>
                            <button className="btn btn-primary" onClick={saveBranchSubjects}
                                disabled={branchSubjectMappings.length === 0}>
                                Save Mappings & Auto-Add Students ({branchSubjectMappings.length})
                            </button>
                        </div>
                    </div>

                    {/* Seating & Allocation Settings (combined) */}
                    <div className="card">
                        <h3>Seating & Allocation Settings</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Seating Mode</label>
                                <select value={session.seating_mode}
                                    onChange={async (e) => {
                                        await sessionsApi.update(sessionId, { seatingMode: e.target.value });
                                        loadSession();
                                    }}>
                                    <option value="SINGLE">SINGLE — 1 student per bench</option>
                                    <option value="DOUBLE">DOUBLE — 2 students (different subjects)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Allocation Method</label>
                                <select value={session.allocation_method || 'INTERLEAVED'}
                                    onChange={async (e) => {
                                        await sessionsApi.update(sessionId, { allocationMethod: e.target.value });
                                        loadSession();
                                    }}>
                                    <option value="INTERLEAVED">INTERLEAVED — mix for spacing</option>
                                    <option value="LINEAR">LINEAR — contiguous blocks</option>
                                </select>
                            </div>
                        </div>
                        <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            <strong>INTERLEAVED:</strong> Adjacent seats have different subjects.{' '}
                            <strong>LINEAR:</strong> Students from same branch fill seats sequentially.
                        </p>
                    </div>
                </div>
            )}

            {/* ── TAB: STUDENTS ────────────────────────────────────── */}
            {activeTab === 'students' && (
                <div>
                    <div className="card">
                        <h3>Student Roll Number Entries</h3>
                        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                            Students are auto-populated from branch-subject mappings. You can exclude or include specific roll numbers below.
                        </p>

                        {studentEntries.length === 0 && (
                            <div className="alert alert-warning" style={{ fontSize: 13 }}>
                                No student entries yet. Go to Configuration tab, add Branch → Subject mappings, and click "Save Mappings & Auto-Add Students".
                            </div>
                        )}

                        {studentEntries.map((entry, i) => {
                            const year = entry.year || pickerYear || configuredYears[0];
                            const key = `${year}-${entry.branchId}`;
                            const branchStudents = dbStudents[key] || [];

                            return (
                                <div key={i} className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div>
                                            <strong style={{ color: '#1a73e8' }}>
                                                {entry.branchCode || `Branch ${entry.branchId}`}
                                            </strong>
                                            <span style={{ margin: '0 6px', color: '#999' }}>→</span>
                                            <strong>{entry.subjectName || `Subject ${entry.subjectId}`}</strong>
                                            {year && <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>(Year {year})</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {entry.savedCount > 0 && (
                                                <span className="badge badge-success">{entry.savedCount} saved</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Show DB student count */}
                                    {branchStudents.length > 0 ? (
                                        <div style={{ fontSize: 13, color: '#1565c0', marginBottom: 8 }}>
                                            {branchStudents.length} students in database
                                            <span style={{ color: '#666' }}>
                                                {' '}(Rolls: {branchStudents[0]?.roll_number} … {branchStudents[branchStudents.length - 1]?.roll_number})
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 13, color: '#e65100', marginBottom: 8, background: '#fff3e0', padding: '6px 10px', borderRadius: 4 }}>
                                            ⚠ No students found in database for {entry.branchCode || `Branch ${entry.branchId}`}
                                            {year ? ` (Year ${year})` : ''}. Import student data for this branch first.
                                        </div>
                                    )}

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Exclude (comma-separated)</label>
                                            <input value={entry.excludeStr}
                                                onChange={e => updateStudentEntry(i, 'excludeStr', e.target.value)}
                                                placeholder="e.g. 2451-23-733-005, 2451-23-733-010" />
                                        </div>
                                        <div className="form-group">
                                            <label>Include (extra rolls)</label>
                                            <input value={entry.includeStr}
                                                onChange={e => updateStudentEntry(i, 'includeStr', e.target.value)}
                                                placeholder="e.g. 2451-23-733-099" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {studentEntries.length > 0 && (
                            <div className="btn-group" style={{ marginTop: 8 }}>
                                <button className="btn btn-primary" onClick={saveStudents}>
                                    Save All Students ({studentEntries.length} entries)
                                </button>
                            </div>
                        )}
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
