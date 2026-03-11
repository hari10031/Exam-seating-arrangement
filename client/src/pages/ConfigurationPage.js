import React, { useState, useEffect, useCallback } from 'react';
import { configApi, branchesApi, subjectsApi } from '../api';

// ── Helper: Read file to base64 ─────────────────────────────
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ── Helper: auto-detect columns by header keywords ──────────
function autoDetectColumns(headers) {
    const mapping = {};
    for (const h of headers) {
        const name = (h.name || '').toLowerCase();
        if (!mapping.rollNumber && (name.includes('roll') || name.includes('htno') || name.includes('hall ticket'))) {
            mapping.rollNumber = h.col;
        }
        if (!mapping.branch && name.includes('branch')) {
            mapping.branch = h.col;
        }
        if (!mapping.studentName && (name.includes('name of the student') || name.includes('student name') || name === 'name')) {
            mapping.studentName = h.col;
        }
        if (!mapping.subjectCode && (name.includes('subject code') || name.includes('sub code') || name.includes('subcode'))) {
            mapping.subjectCode = h.col;
        }
        if (!mapping.subjectName && (name.includes('subject name') || name.includes('sub name'))) {
            mapping.subjectName = h.col;
        }
        if (!mapping.examDate && (name.includes('date') || name.includes('exam date'))) {
            mapping.examDate = h.col;
        }
        if (!mapping.slot && (name.includes('slot') || name.includes('session') || name === 'fn/an')) {
            mapping.slot = h.col;
        }
        if (!mapping.time && (name === 'time' || name.includes('timing') || name.includes('time slot'))) {
            mapping.time = h.col;
        }
        if (!mapping.year && (name === 'year' || name === 'yr' || name.includes('academic year'))) {
            mapping.year = h.col;
        }
    }
    return mapping;
}

// ── Helper: extract admission year code from roll number ─────
function extractAdmissionCode(rollNumber) {
    const str = String(rollNumber || '').trim();
    const parts = str.split('-');
    if (parts.length >= 2 && /^\d{2}$/.test(parts[1])) {
        return parts[1];
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN CONFIGURATION PAGE
// ═══════════════════════════════════════════════════════════════

export default function ConfigurationPage() {
    const [activeTab, setActiveTab] = useState('students');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [allBranches, setAllBranches] = useState([]);
    const [allSubjects, setAllSubjects] = useState([]);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        branchesApi.getAll().then(setAllBranches).catch(e => setError(e.message));
        subjectsApi.getAll().then(setAllSubjects).catch(e => setError(e.message));
    }, []);

    const clearMessages = () => { setError(''); setSuccess(''); };

    const handleReset = async () => {
        setResetting(true);
        clearMessages();
        try {
            await configApi.resetDatabase();
            setSuccess('All database data has been deleted successfully.');
            setAllBranches([]);
            setAllSubjects([]);
            setShowResetConfirm(false);
        } catch (e) {
            setError(e.message);
        } finally {
            setResetting(false);
        }
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>Configuration</h2>
                    <p style={{ color: '#666', fontSize: 14 }}>Import and configure data from XLSX files</p>
                </div>
                <button
                    onClick={() => setShowResetConfirm(true)}
                    style={{
                        background: '#dc3545', color: '#fff', border: 'none',
                        padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
                        fontWeight: 600, fontSize: 14
                    }}
                >
                    Reset Database
                </button>
            </div>

            {showResetConfirm && (
                <div style={{
                    background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8,
                    padding: 16, marginBottom: 16
                }}>
                    <strong style={{ color: '#856404' }}>⚠ Are you sure?</strong>
                    <p style={{ margin: '8px 0', color: '#856404' }}>
                        This will permanently delete <b>all data</b> from the database including rooms, branches,
                        subjects, sessions, allocations, timetable, electives, and imported students.
                        This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={handleReset}
                            disabled={resetting}
                            style={{
                                background: '#dc3545', color: '#fff', border: 'none',
                                padding: '6px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600
                            }}
                        >
                            {resetting ? 'Deleting...' : 'Yes, Delete Everything'}
                        </button>
                        <button
                            onClick={() => setShowResetConfirm(false)}
                            disabled={resetting}
                            style={{
                                background: '#6c757d', color: '#fff', border: 'none',
                                padding: '6px 16px', borderRadius: 4, cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="tabs">
                {['students', 'subjects', 'electives', 'timetable'].map(tab => (
                    <div key={tab}
                        className={'tab' + (activeTab === tab ? ' active' : '')}
                        onClick={() => { setActiveTab(tab); clearMessages(); }}>
                        {tab === 'students' ? 'Student Roll List' :
                            tab === 'subjects' ? 'Year\u2192Branch\u2192Subject' :
                                tab === 'electives' ? 'Electives' : 'Exam Timetable'}
                    </div>
                ))}
            </div>

            {activeTab === 'students' && (
                <StudentImportTab
                    allBranches={allBranches}
                    onError={setError} onSuccess={setSuccess}
                    clearMessages={clearMessages}
                />
            )}
            {activeTab === 'subjects' && (
                <SubjectMappingTab
                    allBranches={allBranches} allSubjects={allSubjects}
                    onError={setError} onSuccess={setSuccess}
                    clearMessages={clearMessages}
                    reloadSubjects={() => subjectsApi.getAll().then(setAllSubjects)}
                    reloadBranches={() => branchesApi.getAll().then(setAllBranches)}
                />
            )}
            {activeTab === 'electives' && (
                <ElectivesTab
                    allSubjects={allSubjects}
                    onError={setError} onSuccess={setSuccess}
                    clearMessages={clearMessages}
                />
            )}
            {activeTab === 'timetable' && (
                <TimetableTab
                    allBranches={allBranches} allSubjects={allSubjects}
                    onError={setError} onSuccess={setSuccess}
                    clearMessages={clearMessages}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  TAB 1: Student Roll List Import (Multi-sheet support)
// ═══════════════════════════════════════════════════════════════

function StudentImportTab({ allBranches, onError, onSuccess, clearMessages }) {
    const [file, setFile] = useState(null);
    const [sheets, setSheets] = useState(null);
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [activePreviewSheet, setActivePreviewSheet] = useState(0);
    const [mapping, setMapping] = useState({});
    const [step, setStep] = useState('upload');
    const [previewRows, setPreviewRows] = useState([]);
    const [admissionCodes, setAdmissionCodes] = useState([]);
    const [yearMapping, setYearMapping] = useState({});
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [existingData, setExistingData] = useState([]);

    useEffect(() => {
        configApi.getStudentYears().then(setExistingData).catch(() => { });
    }, [importResult]);

    const currentSheet = sheets ? sheets[activePreviewSheet] : null;

    const handleFileSelect = async (e) => {
        clearMessages();
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);
        setSheets(null);
        setMapping({});
        setStep('upload');
        setImportResult(null);
        setPreviewRows([]);
        setAdmissionCodes([]);
        setYearMapping({});
        setSelectedSheets([]);

        try {
            const base64 = await readFileAsBase64(f);
            const result = await configApi.detectColumns(base64);
            setSheets(result.sheets);

            // Select all sheets by default
            setSelectedSheets(result.sheets.map(s => s.name));
            setActivePreviewSheet(0);

            if (result.sheets.length > 0) {
                const auto = autoDetectColumns(result.sheets[0].headers);
                setMapping(auto);
            }
            setStep('columns');
        } catch (err) {
            onError('Failed to read XLSX: ' + err.message);
        }
    };

    const handlePreviewSheetChange = (idx) => {
        setActivePreviewSheet(idx);
        if (sheets[idx]) {
            const auto = autoDetectColumns(sheets[idx].headers);
            setMapping(auto);
        }
    };

    const toggleSheet = (name) => {
        setSelectedSheets(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const toggleAllSheets = () => {
        if (!sheets) return;
        if (selectedSheets.length === sheets.length) {
            setSelectedSheets([]);
        } else {
            setSelectedSheets(sheets.map(s => s.name));
        }
    };

    const handleMapColumn = (field, colNum) => {
        setMapping(prev => ({ ...prev, [field]: colNum ? Number(colNum) : null }));
    };

    const proceedToYearMap = () => {
        if (!mapping.rollNumber) {
            onError('Roll Number column is required');
            return;
        }
        if (selectedSheets.length === 0) {
            onError('Select at least one sheet to import');
            return;
        }

        // Gather sample rows from all selected sheets
        const allRows = [];
        const codes = new Set();
        for (const s of sheets) {
            if (!selectedSheets.includes(s.name)) continue;
            for (const row of s.sampleRows) {
                allRows.push({
                    sheet: s.name,
                    rollNumber: row[mapping.rollNumber] || '',
                    studentName: mapping.studentName ? (row[mapping.studentName] || '') : '',
                    branch: mapping.branch ? (row[mapping.branch] || '') : ''
                });
                const code = extractAdmissionCode(row[mapping.rollNumber]);
                if (code) codes.add(code);
            }
        }
        setPreviewRows(allRows);

        const codeArr = Array.from(codes).sort();
        setAdmissionCodes(codeArr);

        // Auto-suggest year mapping
        const currentYear = new Date().getFullYear();
        const autoYearMap = {};
        for (const code of codeArr) {
            const admYear = 2000 + Number(code);
            const academicYear = currentYear - admYear;
            if (academicYear >= 1 && academicYear <= 6) {
                autoYearMap[code] = academicYear;
            }
        }
        setYearMapping(autoYearMap);
        setStep('yearmap');
    };

    const proceedToPreview = () => {
        const mapped = Object.values(yearMapping).filter(v => v);
        if (mapped.length === 0) {
            onError('Map at least one admission year code to an academic year');
            return;
        }
        setStep('preview');
    };

    const handleImport = async () => {
        clearMessages();
        if (!file || !mapping.rollNumber || Object.keys(yearMapping).length === 0) return;
        if (selectedSheets.length === 0) return;

        setImporting(true);
        try {
            const base64 = await readFileAsBase64(file);
            const result = await configApi.importStudents({
                fileData: base64,
                yearMapping,
                columnMapping: {
                    rollNumber: mapping.rollNumber,
                    studentName: mapping.studentName || null,
                    branch: mapping.branch || null
                },
                sheetNames: selectedSheets,
                headerRow: currentSheet ? currentSheet.headerRow : undefined,
                createMissingBranches: true
            });
            setImportResult(result);
            onSuccess('Imported ' + result.imported + ' students from ' + selectedSheets.length + ' sheet(s)');
            setStep('done');
        } catch (err) {
            onError(err.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <div className="card">
                <h3>Import Student Roll List (XLSX)</h3>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                    Upload an XLSX file with student roll numbers. You can import from multiple sheets at once.
                    The system auto-detects columns and extracts the admission year from roll numbers.
                </p>

                <div className="form-group">
                    <label>XLSX File *</label>
                    <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                </div>

                {/* Step 1: Sheet Selection & Column Mapping */}
                {step !== 'upload' && sheets && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Step 1: Select Sheets &amp; Map Columns</h4>

                        {/* Sheet selection checkboxes */}
                        {sheets.length > 1 && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Sheets to Import:</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <label style={{ fontSize: 12, cursor: 'pointer', marginRight: 8 }}>
                                        <input type="checkbox"
                                            checked={selectedSheets.length === sheets.length}
                                            onChange={toggleAllSheets}
                                            style={{ marginRight: 4 }}
                                        />
                                        <strong>All</strong>
                                    </label>
                                    {sheets.map((s, i) => (
                                        <label key={i} style={{
                                            fontSize: 12, cursor: 'pointer',
                                            padding: '2px 8px', borderRadius: 4,
                                            background: selectedSheets.includes(s.name) ? '#c8e6c9' : '#eee'
                                        }}>
                                            <input type="checkbox"
                                                checked={selectedSheets.includes(s.name)}
                                                onChange={() => toggleSheet(s.name)}
                                                style={{ marginRight: 4 }}
                                            />
                                            {s.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Column mapping - preview from active sheet */}
                        {sheets.length > 1 && (
                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 12 }}>Preview columns from sheet:</label>
                                <select value={activePreviewSheet} onChange={e => handlePreviewSheetChange(Number(e.target.value))}
                                    style={{ maxWidth: 200 }}>
                                    {sheets.map((s, i) => (
                                        <option key={i} value={i}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {currentSheet && (
                            <React.Fragment>
                                <p style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                                    Detected header at row {currentSheet.headerRow}.
                                    {mapping.rollNumber && <span style={{ color: '#2e7d32' }}> &#10003; Auto-mapped columns detected.</span>}
                                </p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                    {[
                                        { key: 'rollNumber', label: 'Roll Number *' },
                                        { key: 'studentName', label: 'Student Name' },
                                        { key: 'branch', label: 'Branch' }
                                    ].map(field => (
                                        <div className="form-group" key={field.key}>
                                            <label>{field.label}</label>
                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={e => handleMapColumn(field.key, e.target.value)}
                                            >
                                                <option value="">-- Select --</option>
                                                {currentSheet.headers.map(h => (
                                                    <option key={h.col} value={h.col}>
                                                        Col {h.col}: {h.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                {/* Sample data */}
                                {currentSheet.sampleRows.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <strong style={{ fontSize: 13 }}>Sample Data (mapped columns highlighted):</strong>
                                        <div className="table-wrapper" style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        {currentSheet.headers.map(h => {
                                                            const isMapped = Object.values(mapping).includes(h.col);
                                                            return (
                                                                <th key={h.col} style={{
                                                                    fontSize: 11,
                                                                    background: isMapped ? '#c8e6c9' : undefined,
                                                                    fontWeight: isMapped ? 700 : 400
                                                                }}>
                                                                    {h.name}
                                                                </th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {currentSheet.sampleRows.map((row, i) => (
                                                        <tr key={i}>
                                                            {currentSheet.headers.map(h => {
                                                                const isMapped = Object.values(mapping).includes(h.col);
                                                                return (
                                                                    <td key={h.col} style={{
                                                                        fontSize: 11,
                                                                        background: isMapped ? '#e8f5e9' : undefined,
                                                                        fontWeight: isMapped ? 600 : 400
                                                                    }}>
                                                                        {row[h.col] || ''}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        )}

                        {step === 'columns' && (
                            <button className="btn btn-primary" style={{ marginTop: 12 }}
                                disabled={!mapping.rollNumber || selectedSheets.length === 0}
                                onClick={proceedToYearMap}>
                                Next: Map Admission Year &#8594;
                            </button>
                        )}
                    </div>
                )}

                {/* Step 2: Admission Year Mapping */}
                {(step === 'yearmap' || step === 'preview' || step === 'done') && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Step 2: Map Admission Year &#8594; Academic Year</h4>
                        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                            Roll numbers like <strong>2451-<em>22</em>-733-001</strong> contain the admission year (22 = 2022).
                            Map each admission year code to the current academic year (1st / 2nd / 3rd / 4th).
                        </p>

                        {admissionCodes.length === 0 ? (
                            <p style={{ color: '#c62828' }}>
                                No admission year codes detected in sample data. Check roll number format.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                {admissionCodes.map(code => (
                                    <div key={code} className="form-group" style={{ minWidth: 180 }}>
                                        <label>
                                            Admission <strong>20{code}</strong> &#8594; Year
                                        </label>
                                        <select
                                            value={yearMapping[code] || ''}
                                            onChange={e => setYearMapping(prev => ({
                                                ...prev,
                                                [code]: e.target.value ? Number(e.target.value) : null
                                            }))}
                                        >
                                            <option value="">-- Skip --</option>
                                            <option value="1">1st Year</option>
                                            <option value="2">2nd Year</option>
                                            <option value="3">3rd Year</option>
                                            <option value="4">4th Year</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        )}

                        {step === 'yearmap' && admissionCodes.length > 0 && (
                            <button className="btn btn-primary" style={{ marginTop: 12 }}
                                onClick={proceedToPreview}>
                                Next: Preview &#8594;
                            </button>
                        )}
                    </div>
                )}

                {/* Step 3: Preview & Confirm */}
                {(step === 'preview' || step === 'done') && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Step 3: Preview &amp; Confirm</h4>

                        <div style={{ marginBottom: 12, fontSize: 13 }}>
                            <strong>File:</strong> {file && file.name} |{' '}
                            <strong>Sheets:</strong> {selectedSheets.join(', ')}
                            <br />
                            <strong>Year Mapping:</strong>{' '}
                            {Object.entries(yearMapping).filter(e => e[1]).map(([code, yr]) => (
                                <span key={code} className="badge badge-info" style={{ marginRight: 4 }}>
                                    20{code} &#8594; Year {yr}
                                </span>
                            ))}
                        </div>

                        <div className="table-wrapper" style={{ maxHeight: 200, overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        {sheets && sheets.length > 1 && <th>Sheet</th>}
                                        <th>Roll Number</th>
                                        <th>Student Name</th>
                                        <th>Branch</th>
                                        <th>Admission Code</th>
                                        <th>&#8594; Academic Year</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => {
                                        const code = extractAdmissionCode(row.rollNumber);
                                        const yr = code ? yearMapping[code] : null;
                                        return (
                                            <tr key={i}>
                                                {sheets && sheets.length > 1 && <td style={{ fontSize: 11 }}>{row.sheet}</td>}
                                                <td><strong>{row.rollNumber}</strong></td>
                                                <td>{row.studentName}</td>
                                                <td>{row.branch}</td>
                                                <td>{code ? '20' + code : '\u2014'}</td>
                                                <td>
                                                    {yr ? (
                                                        <span className="badge badge-success">Year {yr}</span>
                                                    ) : (
                                                        <span className="badge badge-warning">Skip</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {step === 'preview' && (
                            <button className="btn btn-success" style={{ marginTop: 12 }}
                                onClick={handleImport} disabled={importing}>
                                {importing ? 'Importing...' : 'Confirm & Import (' + selectedSheets.length + ' sheets)'}
                            </button>
                        )}
                    </div>
                )}

                {/* Import Results */}
                {importResult && (
                    <div className="card" style={{ marginTop: 16, background: '#e8f5e9', boxShadow: 'none' }}>
                        <strong>Import Results:</strong>
                        <p>Imported: {importResult.imported} | Skipped: {importResult.skipped}</p>
                        {importResult.createdBranches && importResult.createdBranches.length > 0 && (
                            <p>Created branches: {importResult.createdBranches.join(', ')}</p>
                        )}
                        {importResult.yearBreakdown && (
                            <div style={{ marginTop: 8 }}>
                                <strong>By Year:</strong>
                                {Object.entries(importResult.yearBreakdown).map(([yr, cnt]) => (
                                    <span key={yr} className="badge badge-info" style={{ marginLeft: 6 }}>
                                        Year {yr}: {cnt} students
                                    </span>
                                ))}
                            </div>
                        )}
                        {importResult.errors && importResult.errors.length > 0 && (
                            <details>
                                <summary style={{ cursor: 'pointer' }}>
                                    {importResult.errors.length} errors
                                </summary>
                                <ul>
                                    {importResult.errors.slice(0, 20).map((e, i) => (
                                        <li key={i}>{e.rollNumber}: {e.reason}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {/* Existing student data summary */}
            {existingData.length > 0 && (
                <div className="card">
                    <h3>Imported Student Data</h3>
                    <table>
                        <thead>
                            <tr><th>Year</th><th>Students</th></tr>
                        </thead>
                        <tbody>
                            {existingData.map(d => (
                                <tr key={d.year}>
                                    <td>Year {d.year}</td>
                                    <td>{d.student_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  TAB 2: Year -> Branch -> Subject Mapping
//  Supports optional Year column from XLSX, multi-sheet import
// ═══════════════════════════════════════════════════════════════

function SubjectMappingTab({ allBranches, allSubjects, onError, onSuccess, clearMessages, reloadSubjects, reloadBranches }) {
    const [year, setYear] = useState('');
    const [file, setFile] = useState(null);
    const [sheets, setSheets] = useState(null);
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [activePreviewSheet, setActivePreviewSheet] = useState(0);
    const [mapping, setMapping] = useState({});
    const [step, setStep] = useState('upload');
    const [previewRows, setPreviewRows] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [existingMappings, setExistingMappings] = useState([]);
    const [viewYear, setViewYear] = useState('');

    const hasYearColumn = !!mapping.year;
    const currentSheet = sheets ? sheets[activePreviewSheet] : null;

    const loadMappings = useCallback(async (y) => {
        if (!y) return;
        try {
            const data = await configApi.getYearSubjects(y);
            setExistingMappings(data);
        } catch (err) { onError(err.message); }
    }, [onError]);

    useEffect(() => {
        if (viewYear) loadMappings(viewYear);
    }, [viewYear, loadMappings, importResult]);

    const handleFileSelect = async (e) => {
        clearMessages();
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);
        setSheets(null);
        setMapping({});
        setStep('upload');
        setImportResult(null);
        setPreviewRows([]);
        setSelectedSheets([]);

        try {
            const base64 = await readFileAsBase64(f);
            const result = await configApi.detectColumns(base64);
            setSheets(result.sheets);
            setSelectedSheets(result.sheets.map(s => s.name));
            setActivePreviewSheet(0);
            if (result.sheets.length > 0) {
                setMapping(autoDetectColumns(result.sheets[0].headers));
            }
            setStep('columns');
        } catch (err) {
            onError('Failed to read XLSX: ' + err.message);
        }
    };

    const handlePreviewSheetChange = (idx) => {
        setActivePreviewSheet(idx);
        if (sheets[idx]) setMapping(autoDetectColumns(sheets[idx].headers));
    };

    const toggleSheet = (name) => {
        setSelectedSheets(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const toggleAllSheets = () => {
        if (!sheets) return;
        if (selectedSheets.length === sheets.length) {
            setSelectedSheets([]);
        } else {
            setSelectedSheets(sheets.map(s => s.name));
        }
    };

    // Detect subject type from name
    const detectSubjectType = (subjectName, subjectCode) => {
        const name = (subjectName || subjectCode || '').toLowerCase();
        if (name.includes('professional elective') || /\bpe\b/.test(name)) return 'PE';
        if (name.includes('open elective') || /\boe\b/.test(name)) return 'OE';
        return 'REGULAR';
    };

    const proceedToPreview = () => {
        if (!mapping.branch || (!mapping.subjectCode && !mapping.subjectName)) {
            onError('Branch and at least one of Subject Name or Subject Code columns are required');
            return;
        }
        if (!hasYearColumn && !year) {
            onError('Please select a year or map a Year column');
            return;
        }
        if (selectedSheets.length === 0) {
            onError('Select at least one sheet');
            return;
        }

        // Gather preview rows from all selected sheets
        const rows = [];
        for (const s of sheets) {
            if (!selectedSheets.includes(s.name)) continue;
            for (const row of s.sampleRows) {
                const branchVal = row[mapping.branch] || '';
                const codeVal = mapping.subjectCode ? (row[mapping.subjectCode] || '') : '';
                const nameVal = mapping.subjectName ? (row[mapping.subjectName] || '') : '';
                const displayCode = codeVal || nameVal;
                const displayName = nameVal || codeVal;
                const yearVal = hasYearColumn ? (row[mapping.year] || '') : year;
                const detectedType = detectSubjectType(displayName, displayCode);
                if (branchVal && (displayCode || displayName)) {
                    rows.push({
                        sheet: s.name,
                        branch: branchVal,
                        subjectCode: displayCode,
                        subjectName: displayName,
                        subjectType: detectedType,
                        year: yearVal
                    });
                }
            }
        }
        setPreviewRows(rows);
        setStep('preview');
    };

    const handleImport = async () => {
        clearMessages();
        if (!file || (!hasYearColumn && !year) || !mapping.branch || (!mapping.subjectCode && !mapping.subjectName)) return;
        if (selectedSheets.length === 0) return;
        setImporting(true);
        try {
            const base64 = await readFileAsBase64(file);
            const colMap = {
                branch: mapping.branch,
                subjectCode: mapping.subjectCode || null,
                subjectName: mapping.subjectName || null
            };
            if (hasYearColumn) {
                colMap.year = mapping.year;
            }
            const result = await configApi.importYearSubjects({
                fileData: base64,
                year: hasYearColumn ? undefined : Number(year),
                columnMapping: colMap,
                sheetNames: selectedSheets,
                headerRow: currentSheet ? currentSheet.headerRow : undefined,
                autoDetectType: true,
                createMissing: true
            });
            setImportResult(result);
            if (!hasYearColumn) setViewYear(year);
            setStep('done');
            onSuccess('Imported ' + result.imported + ' subject mappings');
            reloadSubjects();
            reloadBranches();
        } catch (err) {
            onError(err.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <div className="card">
                <h3>Import Year &#8594; Branch &#8594; Subject Mapping (XLSX)</h3>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                    Upload an XLSX with Branch and Subject Code columns.
                    If the XLSX has a Year column, map it to auto-detect the year per row.
                    Subjects containing &quot;Professional Elective&quot; or &quot;Open Elective&quot; are automatically marked.
                </p>

                <div className="form-row">
                    <div className="form-group">
                        <label>XLSX File *</label>
                        <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                    </div>
                </div>

                {step !== 'upload' && sheets && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Map Columns</h4>

                        {/* Sheet selection */}
                        {sheets.length > 1 && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Sheets to Import:</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <label style={{ fontSize: 12, cursor: 'pointer', marginRight: 8 }}>
                                        <input type="checkbox"
                                            checked={selectedSheets.length === sheets.length}
                                            onChange={toggleAllSheets}
                                            style={{ marginRight: 4 }}
                                        />
                                        <strong>All</strong>
                                    </label>
                                    {sheets.map((s, i) => (
                                        <label key={i} style={{
                                            fontSize: 12, cursor: 'pointer',
                                            padding: '2px 8px', borderRadius: 4,
                                            background: selectedSheets.includes(s.name) ? '#c8e6c9' : '#eee'
                                        }}>
                                            <input type="checkbox"
                                                checked={selectedSheets.includes(s.name)}
                                                onChange={() => toggleSheet(s.name)}
                                                style={{ marginRight: 4 }}
                                            />
                                            {s.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {sheets.length > 1 && (
                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 12 }}>Preview columns from sheet:</label>
                                <select value={activePreviewSheet} onChange={e => handlePreviewSheetChange(Number(e.target.value))}
                                    style={{ maxWidth: 200 }}>
                                    {sheets.map((s, i) => (
                                        <option key={i} value={i}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {currentSheet && (
                            <React.Fragment>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                                    {[
                                        { key: 'year', label: 'Year (from data)' },
                                        { key: 'branch', label: 'Branch *' },
                                        { key: 'subjectName', label: 'Subject Name *' },
                                        { key: 'subjectCode', label: 'Subject Code' }
                                    ].map(field => (
                                        <div className="form-group" key={field.key}>
                                            <label>{field.label}</label>
                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value ? Number(e.target.value) : null }))}
                                            >
                                                <option value="">{field.key === 'year' ? '-- None (select manually) --' : '-- Select --'}</option>
                                                {currentSheet.headers.map(h => (
                                                    <option key={h.col} value={h.col}>Col {h.col}: {h.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                {/* Manual year selector - only show if no year column mapped */}
                                {!hasYearColumn && (
                                    <div className="form-group" style={{ maxWidth: 200 }}>
                                        <label>Year * (manual)</label>
                                        <select value={year} onChange={e => setYear(e.target.value)}>
                                            <option value="">-- Select Year --</option>
                                            <option value="1">1st Year</option>
                                            <option value="2">2nd Year</option>
                                            <option value="3">3rd Year</option>
                                            <option value="4">4th Year</option>
                                        </select>
                                    </div>
                                )}

                                {hasYearColumn && (
                                    <p style={{ fontSize: 12, color: '#2e7d32', marginTop: 4 }}>
                                        &#10003; Year will be read from each row&apos;s data column.
                                    </p>
                                )}

                                {/* Sample data */}
                                {currentSheet.sampleRows.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <strong style={{ fontSize: 13 }}>Sample Data:</strong>
                                        <div className="table-wrapper" style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        {currentSheet.headers.map(h => {
                                                            const isMapped = Object.values(mapping).filter(Boolean).includes(h.col);
                                                            return (
                                                                <th key={h.col} style={{
                                                                    fontSize: 11,
                                                                    background: isMapped ? '#c8e6c9' : undefined,
                                                                    fontWeight: isMapped ? 700 : 400
                                                                }}>
                                                                    {h.name}
                                                                </th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {currentSheet.sampleRows.map((row, i) => (
                                                        <tr key={i}>
                                                            {currentSheet.headers.map(h => {
                                                                const isMapped = Object.values(mapping).filter(Boolean).includes(h.col);
                                                                return (
                                                                    <td key={h.col} style={{
                                                                        fontSize: 11,
                                                                        background: isMapped ? '#e8f5e9' : undefined,
                                                                        fontWeight: isMapped ? 600 : 400
                                                                    }}>
                                                                        {row[h.col] || ''}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        )}

                        {step === 'columns' && (
                            <button className="btn btn-primary" style={{ marginTop: 12 }}
                                disabled={!mapping.branch || (!mapping.subjectCode && !mapping.subjectName) || (!hasYearColumn && !year) || selectedSheets.length === 0}
                                onClick={proceedToPreview}>
                                Next: Preview &#8594;
                            </button>
                        )}
                    </div>
                )}

                {/* Preview */}
                {(step === 'preview' || step === 'done') && previewRows.length > 0 && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Preview</h4>
                        <div className="table-wrapper" style={{ maxHeight: 250, overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        {sheets && sheets.length > 1 && <th>Sheet</th>}
                                        <th>Year</th>
                                        <th>Branch</th>
                                        <th>Subject Code</th>
                                        <th>Subject Name</th>
                                        <th>Auto-Detected Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((r, i) => (
                                        <tr key={i}>
                                            {sheets && sheets.length > 1 && <td style={{ fontSize: 11 }}>{r.sheet}</td>}
                                            <td>Year {r.year}</td>
                                            <td>{r.branch}</td>
                                            <td>{r.subjectCode}</td>
                                            <td>{r.subjectName}</td>
                                            <td>
                                                <span className={'badge ' + (r.subjectType === 'PE' ? 'badge-warning' : r.subjectType === 'OE' ? 'badge-info' : 'badge-success')}>
                                                    {r.subjectType}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {step === 'preview' && (
                            <button className="btn btn-success" style={{ marginTop: 12 }}
                                onClick={handleImport} disabled={importing}>
                                {importing ? 'Importing...' : 'Confirm & Import'}
                            </button>
                        )}
                    </div>
                )}

                {importResult && (
                    <div className="card" style={{ marginTop: 16, background: '#e8f5e9', boxShadow: 'none' }}>
                        <strong>Import Results:</strong>
                        <p>Imported: {importResult.imported} | Skipped: {importResult.skipped}</p>
                        {importResult.yearBreakdown && Object.keys(importResult.yearBreakdown).length > 0 && (
                            <div style={{ marginTop: 4 }}>
                                <strong>By Year:</strong>
                                {Object.entries(importResult.yearBreakdown).map(([yr, cnt]) => (
                                    <span key={yr} className="badge badge-info" style={{ marginLeft: 6 }}>
                                        Year {yr}: {cnt} mappings
                                    </span>
                                ))}
                            </div>
                        )}
                        {importResult.createdSubjects && importResult.createdSubjects.length > 0 && (
                            <p>Created subjects: {importResult.createdSubjects.join(', ')}</p>
                        )}
                        {importResult.createdBranches && importResult.createdBranches.length > 0 && (
                            <p>Created branches: {importResult.createdBranches.join(', ')}</p>
                        )}
                        {importResult.errors && importResult.errors.length > 0 && (
                            <details>
                                <summary style={{ cursor: 'pointer' }}>{importResult.errors.length} errors</summary>
                                <ul>
                                    {importResult.errors.slice(0, 20).map((e, i) => (
                                        <li key={i}>{e.subjectCode}: {e.reason}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {/* View Existing Mappings */}
            <div className="card">
                <h3>View Subject Mappings</h3>
                <div className="form-group" style={{ maxWidth: 200 }}>
                    <label>Year</label>
                    <select value={viewYear} onChange={e => { setViewYear(e.target.value); }}>
                        <option value="">-- Select --</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                    </select>
                </div>
                {existingMappings.length > 0 && (() => {
                    // Group by branch
                    const byBranch = {};
                    for (const m of existingMappings) {
                        if (!byBranch[m.branch_code]) byBranch[m.branch_code] = { name: m.branch_name, subjects: [] };
                        byBranch[m.branch_code].subjects.push(m);
                    }
                    return (
                        <div>
                            <p style={{ fontSize: 13, color: '#2e7d32', marginBottom: 12 }}>
                                <strong>Total:</strong> {existingMappings.length} subjects across {Object.keys(byBranch).length} branches
                            </p>
                            {Object.entries(byBranch).map(([branchCode, info]) => (
                                <div key={branchCode} style={{ marginBottom: 16 }}>
                                    <h4 style={{ fontSize: 14, marginBottom: 4, borderBottom: '2px solid #1976d2', paddingBottom: 4, color: '#1976d2' }}>
                                        {branchCode} — {info.name}
                                        <span style={{ fontWeight: 400, fontSize: 12, color: '#666', marginLeft: 8 }}>
                                            ({info.subjects.length} subjects)
                                        </span>
                                    </h4>
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 40 }}>#</th>
                                                    <th>Subject Code</th>
                                                    <th>Subject Name</th>
                                                    <th>Type</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {info.subjects.map((m, idx) => (
                                                    <tr key={m.id}>
                                                        <td style={{ color: '#999', fontSize: 12 }}>{idx + 1}</td>
                                                        <td><strong>{m.subject_code}</strong></td>
                                                        <td>{m.subject_name}</td>
                                                        <td>
                                                            <span className={'badge ' + (m.subject_type === 'PE' ? 'badge-warning' : m.subject_type === 'OE' ? 'badge-info' : 'badge-success')}>
                                                                {m.subject_type}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
                {viewYear && existingMappings.length === 0 && (
                    <p style={{ color: '#999' }}>No mappings configured for Year {viewYear}</p>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  TAB 3: Student Electives (Multiple PE/OE, Multi-sheet)
// ═══════════════════════════════════════════════════════════════

function ElectivesTab({ allSubjects, onError, onSuccess, clearMessages }) {
    const [year, setYear] = useState('');
    const [peCount, setPeCount] = useState(1);
    const [oeCount, setOeCount] = useState(1);
    const [file, setFile] = useState(null);
    const [sheets, setSheets] = useState(null);
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [activePreviewSheet, setActivePreviewSheet] = useState(0);
    const [mapping, setMapping] = useState({});
    const [step, setStep] = useState('upload');
    const [previewRows, setPreviewRows] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [existingElectives, setExistingElectives] = useState([]);
    const [viewType, setViewType] = useState('ALL');
    const [viewYear, setViewYear] = useState('');

    const currentSheet = sheets ? sheets[activePreviewSheet] : null;

    const loadElectives = useCallback(async () => {
        if (!viewYear) { setExistingElectives([]); return; }
        try {
            const data = await configApi.getElectives(viewYear, viewType);
            setExistingElectives(data);
        } catch (err) { onError(err.message); }
    }, [viewYear, viewType, onError]);

    useEffect(() => {
        loadElectives();
    }, [viewYear, viewType, loadElectives, importResult]);

    const handleFileSelect = async (e) => {
        clearMessages();
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);
        setSheets(null);
        setMapping({});
        setStep('upload');
        setImportResult(null);
        setPreviewRows([]);
        setSelectedSheets([]);
        try {
            const base64 = await readFileAsBase64(f);
            const result = await configApi.detectColumns(base64);
            setSheets(result.sheets);
            setSelectedSheets(result.sheets.map(s => s.name));
            setActivePreviewSheet(0);
            if (result.sheets.length > 0) {
                const auto = autoDetectColumns(result.sheets[0].headers);
                setMapping(auto);
            }
            setStep('columns');
        } catch (err) {
            onError('Failed to read XLSX: ' + err.message);
        }
    };

    const handlePreviewSheetChange = (idx) => {
        setActivePreviewSheet(idx);
        if (sheets[idx]) setMapping(prev => ({ ...prev, ...autoDetectColumns(sheets[idx].headers) }));
    };

    const toggleSheet = (name) => {
        setSelectedSheets(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const toggleAllSheets = () => {
        if (!sheets) return;
        if (selectedSheets.length === sheets.length) {
            setSelectedSheets([]);
        } else {
            setSelectedSheets(sheets.map(s => s.name));
        }
    };

    // Build dynamic column fields based on PE/OE counts
    const getColumnFields = () => {
        const fields = [{ key: 'rollNumber', label: 'Roll Number *' }];
        for (let i = 1; i <= peCount; i++) {
            fields.push({
                key: peCount === 1 ? 'pe1' : 'pe' + i,
                label: peCount === 1 ? 'PE Subject *' : 'PE-' + i + ' Subject *'
            });
        }
        for (let i = 1; i <= oeCount; i++) {
            fields.push({
                key: oeCount === 1 ? 'oe1' : 'oe' + i,
                label: oeCount === 1 ? 'OE Subject *' : 'OE-' + i + ' Subject *'
            });
        }
        return fields;
    };

    const proceedToPreview = () => {
        if (!mapping.rollNumber) { onError('Roll Number column is required'); return; }
        if (!year) { onError('Please select a year'); return; }
        if (selectedSheets.length === 0) { onError('Select at least one sheet'); return; }

        // Validate PE columns
        for (let i = 1; i <= peCount; i++) {
            const key = peCount === 1 ? 'pe1' : 'pe' + i;
            if (!mapping[key]) {
                onError('PE' + (peCount > 1 ? '-' + i : '') + ' Subject column is required');
                return;
            }
        }
        // Validate OE columns
        for (let i = 1; i <= oeCount; i++) {
            const key = oeCount === 1 ? 'oe1' : 'oe' + i;
            if (!mapping[key]) {
                onError('OE' + (oeCount > 1 ? '-' + i : '') + ' Subject column is required');
                return;
            }
        }

        // Gather preview from selected sheets
        const rows = [];
        for (const s of sheets) {
            if (!selectedSheets.includes(s.name)) continue;
            for (const row of s.sampleRows) {
                const rollNumber = row[mapping.rollNumber] || '';
                if (!rollNumber) continue;
                const entry = { rollNumber, sheet: s.name, peSubjects: [], oeSubjects: [] };
                for (let i = 1; i <= peCount; i++) {
                    const key = peCount === 1 ? 'pe1' : 'pe' + i;
                    entry.peSubjects.push(row[mapping[key]] || '');
                }
                for (let i = 1; i <= oeCount; i++) {
                    const key = oeCount === 1 ? 'oe1' : 'oe' + i;
                    entry.oeSubjects.push(row[mapping[key]] || '');
                }
                rows.push(entry);
            }
        }
        setPreviewRows(rows);
        setStep('preview');
    };

    const handleImport = async () => {
        clearMessages();
        if (!file || !year) return;
        if (selectedSheets.length === 0) return;
        setImporting(true);
        try {
            const base64 = await readFileAsBase64(file);

            // Build column arrays
            const peSubjectCodes = [];
            for (let i = 1; i <= peCount; i++) {
                const key = peCount === 1 ? 'pe1' : 'pe' + i;
                if (mapping[key]) peSubjectCodes.push(mapping[key]);
            }
            const oeSubjectCodes = [];
            for (let i = 1; i <= oeCount; i++) {
                const key = oeCount === 1 ? 'oe1' : 'oe' + i;
                if (mapping[key]) oeSubjectCodes.push(mapping[key]);
            }

            const result = await configApi.importElectives({
                fileData: base64,
                year: Number(year),
                columnMapping: {
                    rollNumber: mapping.rollNumber,
                    peSubjectCodes,
                    oeSubjectCodes
                },
                sheetNames: selectedSheets,
                headerRow: currentSheet ? currentSheet.headerRow : undefined,
                createMissing: true
            });
            setImportResult(result);
            setStep('done');
            onSuccess('Imported ' + result.imported + ' elective choices for Year ' + year);
        } catch (err) {
            onError(err.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <div className="card">
                <h3>Import Student Elective Choices (XLSX)</h3>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                    Upload XLSX mapping students to their Professional Elective (PE) and Open Elective (OE) subjects.
                    Specify how many PE and OE electives each student has, then map each column.
                    You can import from multiple sheets.
                </p>

                <div className="form-row">
                    <div className="form-group">
                        <label>Year *</label>
                        <select value={year} onChange={e => setYear(e.target.value)}>
                            <option value="">-- Select Year --</option>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year</option>
                            <option value="4">4th Year</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>No. of PE Electives</label>
                        <select value={peCount} onChange={e => { setPeCount(Number(e.target.value)); setMapping(prev => ({ rollNumber: prev.rollNumber })); setStep(sheets ? 'columns' : 'upload'); }}>
                            <option value="0">0 (None)</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>No. of OE Electives</label>
                        <select value={oeCount} onChange={e => { setOeCount(Number(e.target.value)); setMapping(prev => ({ rollNumber: prev.rollNumber })); setStep(sheets ? 'columns' : 'upload'); }}>
                            <option value="0">0 (None)</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>XLSX File *</label>
                        <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                    </div>
                </div>

                {(peCount === 0 && oeCount === 0) && (
                    <p style={{ color: '#c62828', fontSize: 13 }}>Please select at least one PE or OE elective count.</p>
                )}

                {/* Column Mapping */}
                {step !== 'upload' && sheets && (peCount > 0 || oeCount > 0) && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Map Columns</h4>

                        {/* Sheet selection */}
                        {sheets.length > 1 && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Sheets to Import:</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <label style={{ fontSize: 12, cursor: 'pointer', marginRight: 8 }}>
                                        <input type="checkbox"
                                            checked={selectedSheets.length === sheets.length}
                                            onChange={toggleAllSheets}
                                            style={{ marginRight: 4 }}
                                        />
                                        <strong>All</strong>
                                    </label>
                                    {sheets.map((s, i) => (
                                        <label key={i} style={{
                                            fontSize: 12, cursor: 'pointer',
                                            padding: '2px 8px', borderRadius: 4,
                                            background: selectedSheets.includes(s.name) ? '#c8e6c9' : '#eee'
                                        }}>
                                            <input type="checkbox"
                                                checked={selectedSheets.includes(s.name)}
                                                onChange={() => toggleSheet(s.name)}
                                                style={{ marginRight: 4 }}
                                            />
                                            {s.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {sheets.length > 1 && (
                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 12 }}>Preview columns from sheet:</label>
                                <select value={activePreviewSheet} onChange={e => handlePreviewSheetChange(Number(e.target.value))}
                                    style={{ maxWidth: 200 }}>
                                    {sheets.map((s, i) => (
                                        <option key={i} value={i}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {currentSheet && (
                            <React.Fragment>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                                    {getColumnFields().map(field => (
                                        <div className="form-group" key={field.key}>
                                            <label>{field.label}</label>
                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value ? Number(e.target.value) : null }))}
                                            >
                                                <option value="">-- Select --</option>
                                                {currentSheet.headers.map(h => (
                                                    <option key={h.col} value={h.col}>Col {h.col}: {h.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                {/* Sample data */}
                                {currentSheet.sampleRows.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <strong style={{ fontSize: 13 }}>Sample Data:</strong>
                                        <div className="table-wrapper" style={{ maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        {currentSheet.headers.map(h => {
                                                            const isMapped = Object.values(mapping).filter(Boolean).includes(h.col);
                                                            return (
                                                                <th key={h.col} style={{
                                                                    fontSize: 11,
                                                                    background: isMapped ? '#c8e6c9' : undefined,
                                                                    fontWeight: isMapped ? 700 : 400
                                                                }}>{h.name}</th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {currentSheet.sampleRows.map((row, i) => (
                                                        <tr key={i}>
                                                            {currentSheet.headers.map(h => {
                                                                const isMapped = Object.values(mapping).filter(Boolean).includes(h.col);
                                                                return (
                                                                    <td key={h.col} style={{
                                                                        fontSize: 11,
                                                                        background: isMapped ? '#e8f5e9' : undefined,
                                                                        fontWeight: isMapped ? 600 : 400
                                                                    }}>{row[h.col] || ''}</td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        )}

                        {step === 'columns' && (
                            <button className="btn btn-primary" style={{ marginTop: 12 }}
                                onClick={proceedToPreview}>
                                Next: Preview &#8594;
                            </button>
                        )}
                    </div>
                )}

                {/* Preview */}
                {(step === 'preview' || step === 'done') && previewRows.length > 0 && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Preview (Year {year})</h4>
                        <div className="table-wrapper" style={{ maxHeight: 200, overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        {sheets && sheets.length > 1 && <th>Sheet</th>}
                                        <th>Roll Number</th>
                                        {Array.from({ length: peCount }, (_, i) => (
                                            <th key={'pe' + i}>{peCount === 1 ? 'PE Subject' : 'PE-' + (i + 1)}</th>
                                        ))}
                                        {Array.from({ length: oeCount }, (_, i) => (
                                            <th key={'oe' + i}>{oeCount === 1 ? 'OE Subject' : 'OE-' + (i + 1)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((r, i) => (
                                        <tr key={i}>
                                            {sheets && sheets.length > 1 && <td style={{ fontSize: 11 }}>{r.sheet}</td>}
                                            <td><strong>{r.rollNumber}</strong></td>
                                            {r.peSubjects.map((s, j) => (
                                                <td key={'pe' + j}>{s}</td>
                                            ))}
                                            {r.oeSubjects.map((s, j) => (
                                                <td key={'oe' + j}>{s}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {step === 'preview' && (
                            <button className="btn btn-success" style={{ marginTop: 12 }}
                                onClick={handleImport} disabled={importing}>
                                {importing ? 'Importing...' : 'Confirm & Import'}
                            </button>
                        )}
                    </div>
                )}

                {importResult && (
                    <div className="card" style={{ marginTop: 16, background: '#e8f5e9', boxShadow: 'none' }}>
                        <strong>Import Results:</strong>
                        <p>Imported: {importResult.imported} | Skipped: {importResult.skipped}</p>
                        {importResult.errors && importResult.errors.length > 0 && (
                            <details>
                                <summary style={{ cursor: 'pointer' }}>{importResult.errors.length} errors</summary>
                                <ul>
                                    {importResult.errors.slice(0, 20).map((e, i) => (
                                        <li key={i}>{e.rollNumber || e.subjectCode}: {e.reason}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {/* Existing elective data */}
            <div className="card">
                <h3>View Elective Mappings</h3>
                <div className="form-row" style={{ maxWidth: 500 }}>
                    <div className="form-group">
                        <label>Year</label>
                        <select value={viewYear} onChange={e => setViewYear(e.target.value)}>
                            <option value="">-- Select Year --</option>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year</option>
                            <option value="4">4th Year</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Type</label>
                        <select value={viewType} onChange={e => setViewType(e.target.value)}>
                            <option value="ALL">All (PE + OE)</option>
                            <option value="PE">Professional Elective</option>
                            <option value="OE">Open Elective</option>
                        </select>
                    </div>
                </div>
                {existingElectives.length > 0 && (() => {
                    const peCount = existingElectives.filter(e => e.elective_type === 'PE').length;
                    const oeCount = existingElectives.filter(e => e.elective_type === 'OE').length;
                    const uniqueStudents = new Set(existingElectives.map(e => e.roll_number)).size;
                    const uniqueSubjects = new Set(existingElectives.map(e => e.subject_code)).size;
                    return (
                        <div>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                <span className="badge badge-info" style={{ fontSize: 13, padding: '4px 10px' }}>
                                    Total: {existingElectives.length} records
                                </span>
                                {peCount > 0 && (
                                    <span className="badge badge-warning" style={{ fontSize: 13, padding: '4px 10px' }}>
                                        PE: {peCount}
                                    </span>
                                )}
                                {oeCount > 0 && (
                                    <span className="badge badge-success" style={{ fontSize: 13, padding: '4px 10px' }}>
                                        OE: {oeCount}
                                    </span>
                                )}
                                <span style={{ fontSize: 13, color: '#555' }}>
                                    | {uniqueStudents} students, {uniqueSubjects} subjects
                                </span>
                            </div>
                            <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>#</th>
                                            <th>Roll Number</th>
                                            <th>Subject Code</th>
                                            <th>Subject Name</th>
                                            <th>Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {existingElectives.map((el, idx) => (
                                            <tr key={el.id}>
                                                <td style={{ color: '#999', fontSize: 12 }}>{idx + 1}</td>
                                                <td><strong>{el.roll_number}</strong></td>
                                                <td>{el.subject_code}</td>
                                                <td>{el.subject_name}</td>
                                                <td>
                                                    <span className={'badge ' + (el.elective_type === 'PE' ? 'badge-warning' : 'badge-success')}>
                                                        {el.elective_type}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()}
                {viewYear && existingElectives.length === 0 && (
                    <p style={{ color: '#999' }}>No {viewType === 'ALL' ? '' : viewType + ' '}electives for Year {viewYear}</p>
                )}
                {!viewYear && (
                    <p style={{ color: '#999' }}>Select a year to view elective mappings</p>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  TAB 4: Exam Timetable (Multi-sheet)
// ═══════════════════════════════════════════════════════════════

function TimetableTab({ allBranches, allSubjects, onError, onSuccess, clearMessages }) {
    const [year, setYear] = useState('');
    const [file, setFile] = useState(null);
    const [sheets, setSheets] = useState(null);
    const [selectedSheets, setSelectedSheets] = useState([]);
    const [activePreviewSheet, setActivePreviewSheet] = useState(0);
    const [mapping, setMapping] = useState({});
    const [step, setStep] = useState('upload');
    const [previewRows, setPreviewRows] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [existingTimetable, setExistingTimetable] = useState([]);
    const [viewYear, setViewYear] = useState('');

    const currentSheet = sheets ? sheets[activePreviewSheet] : null;

    const loadTimetable = useCallback(async (y) => {
        if (!y) return;
        try {
            const data = await configApi.getTimetable(y);
            setExistingTimetable(data);
        } catch (err) { onError(err.message); }
    }, [onError]);

    useEffect(() => {
        if (viewYear) loadTimetable(viewYear);
    }, [viewYear, loadTimetable, importResult]);

    const handleFileSelect = async (e) => {
        clearMessages();
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);
        setSheets(null);
        setMapping({});
        setStep('upload');
        setImportResult(null);
        setPreviewRows([]);
        setSelectedSheets([]);
        try {
            const base64 = await readFileAsBase64(f);
            const result = await configApi.detectColumns(base64);
            setSheets(result.sheets);
            setSelectedSheets(result.sheets.map(s => s.name));
            setActivePreviewSheet(0);
            if (result.sheets.length > 0) {
                setMapping(autoDetectColumns(result.sheets[0].headers));
            }
            setStep('columns');
        } catch (err) {
            onError('Failed to read XLSX: ' + err.message);
        }
    };

    const handlePreviewSheetChange = (idx) => {
        setActivePreviewSheet(idx);
        if (sheets[idx]) setMapping(autoDetectColumns(sheets[idx].headers));
    };

    const toggleSheet = (name) => {
        setSelectedSheets(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const toggleAllSheets = () => {
        if (!sheets) return;
        if (selectedSheets.length === sheets.length) {
            setSelectedSheets([]);
        } else {
            setSelectedSheets(sheets.map(s => s.name));
        }
    };

    const proceedToPreview = () => {
        if (!mapping.branch || !mapping.subjectCode || !mapping.examDate) {
            onError('Branch, Subject Code, and Exam Date columns are required');
            return;
        }
        if (!year) { onError('Please select a year'); return; }
        if (selectedSheets.length === 0) { onError('Select at least one sheet'); return; }

        const rows = [];
        for (const s of sheets) {
            if (!selectedSheets.includes(s.name)) continue;
            for (const row of s.sampleRows) {
                const r = {
                    sheet: s.name,
                    branch: row[mapping.branch] || '',
                    subjectCode: row[mapping.subjectCode] || '',
                    examDate: row[mapping.examDate] || '',
                    slot: mapping.slot ? (row[mapping.slot] || '') : '',
                    time: mapping.time ? (row[mapping.time] || '') : ''
                };
                if (r.branch && r.subjectCode) rows.push(r);
            }
        }
        setPreviewRows(rows);
        setStep('preview');
    };

    const handleImport = async () => {
        clearMessages();
        if (!file || !year) return;
        if (selectedSheets.length === 0) return;
        setImporting(true);
        try {
            const base64 = await readFileAsBase64(file);
            const result = await configApi.importTimetable({
                fileData: base64,
                year: Number(year),
                columnMapping: {
                    branch: mapping.branch,
                    subjectCode: mapping.subjectCode,
                    examDate: mapping.examDate,
                    slot: mapping.slot || null,
                    time: mapping.time || null
                },
                sheetNames: selectedSheets,
                headerRow: currentSheet ? currentSheet.headerRow : undefined,
                createMissing: true
            });
            setImportResult(result);
            setViewYear(year);
            setStep('done');
            onSuccess('Imported ' + result.imported + ' timetable entries for Year ' + year);
        } catch (err) {
            onError(err.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <div className="card">
                <h3>Import Exam Timetable (XLSX)</h3>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                    Upload an XLSX with columns: Branch, Subject Code, Exam Date, Slot (FN/AN).
                    You can import from multiple sheets.
                </p>

                <div className="form-row">
                    <div className="form-group">
                        <label>Year *</label>
                        <select value={year} onChange={e => setYear(e.target.value)}>
                            <option value="">-- Select Year --</option>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year</option>
                            <option value="4">4th Year</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>XLSX File *</label>
                        <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                    </div>
                </div>

                {step !== 'upload' && sheets && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Map Columns</h4>

                        {/* Sheet selection */}
                        {sheets.length > 1 && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Sheets to Import:</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <label style={{ fontSize: 12, cursor: 'pointer', marginRight: 8 }}>
                                        <input type="checkbox"
                                            checked={selectedSheets.length === sheets.length}
                                            onChange={toggleAllSheets}
                                            style={{ marginRight: 4 }}
                                        />
                                        <strong>All</strong>
                                    </label>
                                    {sheets.map((s, i) => (
                                        <label key={i} style={{
                                            fontSize: 12, cursor: 'pointer',
                                            padding: '2px 8px', borderRadius: 4,
                                            background: selectedSheets.includes(s.name) ? '#c8e6c9' : '#eee'
                                        }}>
                                            <input type="checkbox"
                                                checked={selectedSheets.includes(s.name)}
                                                onChange={() => toggleSheet(s.name)}
                                                style={{ marginRight: 4 }}
                                            />
                                            {s.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {sheets.length > 1 && (
                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 12 }}>Preview columns from sheet:</label>
                                <select value={activePreviewSheet} onChange={e => handlePreviewSheetChange(Number(e.target.value))}
                                    style={{ maxWidth: 200 }}>
                                    {sheets.map((s, i) => (
                                        <option key={i} value={i}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {currentSheet && (
                            <React.Fragment>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                                    {[
                                        { key: 'branch', label: 'Branch *' },
                                        { key: 'subjectCode', label: 'Subject Code *' },
                                        { key: 'examDate', label: 'Exam Date *' },
                                        { key: 'slot', label: 'Slot (FN/AN)' },
                                        { key: 'time', label: 'Time' }
                                    ].map(field => (
                                        <div className="form-group" key={field.key}>
                                            <label>{field.label}</label>
                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value ? Number(e.target.value) : null }))}
                                            >
                                                <option value="">-- Select --</option>
                                                {currentSheet.headers.map(h => (
                                                    <option key={h.col} value={h.col}>Col {h.col}: {h.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                {/* Sample data */}
                                {currentSheet.sampleRows.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <strong style={{ fontSize: 13 }}>Sample Data:</strong>
                                        <div className="table-wrapper" style={{ maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        {currentSheet.headers.map(h => {
                                                            const isMapped = Object.values(mapping).filter(Boolean).includes(h.col);
                                                            return (
                                                                <th key={h.col} style={{
                                                                    fontSize: 11,
                                                                    background: isMapped ? '#c8e6c9' : undefined,
                                                                    fontWeight: isMapped ? 700 : 400
                                                                }}>{h.name}</th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {currentSheet.sampleRows.map((row, i) => (
                                                        <tr key={i}>
                                                            {currentSheet.headers.map(h => {
                                                                const isMapped = Object.values(mapping).filter(Boolean).includes(h.col);
                                                                return (
                                                                    <td key={h.col} style={{
                                                                        fontSize: 11,
                                                                        background: isMapped ? '#e8f5e9' : undefined,
                                                                        fontWeight: isMapped ? 600 : 400
                                                                    }}>{row[h.col] || ''}</td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        )}

                        {step === 'columns' && (
                            <button className="btn btn-primary" style={{ marginTop: 12 }}
                                disabled={!mapping.branch || !mapping.subjectCode || !mapping.examDate || !year || selectedSheets.length === 0}
                                onClick={proceedToPreview}>
                                Next: Preview &#8594;
                            </button>
                        )}
                    </div>
                )}

                {/* Preview */}
                {(step === 'preview' || step === 'done') && previewRows.length > 0 && (
                    <div className="card" style={{ background: '#f8f9fb', boxShadow: 'none', padding: 16, marginTop: 12 }}>
                        <h4 style={{ marginBottom: 8 }}>Preview (Year {year})</h4>
                        <div className="table-wrapper" style={{ maxHeight: 200, overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        {sheets && sheets.length > 1 && <th>Sheet</th>}
                                        <th>Date</th>
                                        <th>Slot</th>
                                        <th>Time</th>
                                        <th>Branch</th>
                                        <th>Subject Code</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((r, i) => (
                                        <tr key={i}>
                                            {sheets && sheets.length > 1 && <td style={{ fontSize: 11 }}>{r.sheet}</td>}
                                            <td>{r.examDate}</td>
                                            <td>{r.slot || '\u2014'}</td>
                                            <td>{r.time || '\u2014'}</td>
                                            <td>{r.branch}</td>
                                            <td>{r.subjectCode}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {step === 'preview' && (
                            <button className="btn btn-success" style={{ marginTop: 12 }}
                                onClick={handleImport} disabled={importing}>
                                {importing ? 'Importing...' : 'Confirm & Import'}
                            </button>
                        )}
                    </div>
                )}

                {importResult && (
                    <div className="card" style={{ marginTop: 16, background: '#e8f5e9', boxShadow: 'none' }}>
                        <strong>Import Results:</strong>
                        <p>Imported: {importResult.imported} | Skipped: {importResult.skipped}</p>
                    </div>
                )}
            </div>

            {/* View Existing Timetable */}
            <div className="card">
                <h3>View Timetable</h3>
                <div className="form-group" style={{ maxWidth: 200 }}>
                    <label>Year</label>
                    <select value={viewYear} onChange={e => { setViewYear(e.target.value); }}>
                        <option value="">-- Select --</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                    </select>
                </div>
                {existingTimetable.length > 0 && (
                    <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Slot</th>
                                    <th>Time</th>
                                    <th>Branch</th>
                                    <th>Subject Code</th>
                                    <th>Subject Name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {existingTimetable.map(t => (
                                    <tr key={t.id}>
                                        <td>{t.exam_date}</td>
                                        <td>{t.slot || '\u2014'}</td>
                                        <td>{t.time_slot || '\u2014'}</td>
                                        <td>{t.branch_code}</td>
                                        <td>{t.subject_code}</td>
                                        <td>{t.subject_name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {viewYear && existingTimetable.length === 0 && (
                    <p style={{ color: '#999' }}>No timetable configured for Year {viewYear}</p>
                )}
            </div>
        </div>
    );
}
