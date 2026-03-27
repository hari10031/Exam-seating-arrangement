import React, { useState, useEffect, useRef } from 'react';
import { roomsApi, configApi } from '../api';

export default function RoomsPage() {
    const [rooms, setRooms] = useState([]);
    const [form, setForm] = useState({ roomCode: '', rows: '', columns: '', effectiveCapacity: '' });
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // XLSX import state
    const [showImport, setShowImport] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importSheets, setImportSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [columnMapping, setColumnMapping] = useState({
        roomCode: '',
        rows: '',
        columns: '',
        effectiveCapacity: ''
    });
    const [importLoading, setImportLoading] = useState(false);
    const fileInputRef = useRef(null);

    const load = () => roomsApi.getAll().then(setRooms).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            if (editing) {
                await roomsApi.update(editing, form);
                setSuccess('Room updated successfully');
            } else {
                await roomsApi.create(form);
                setSuccess('Room added successfully');
            }
            setForm({ roomCode: '', rows: '', columns: '', effectiveCapacity: '' });
            setEditing(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEdit = (room) => {
        setEditing(room.id);
        setForm({
            roomCode: room.room_code,
            rows: String(room.rows),
            columns: String(room.columns),
            effectiveCapacity: room.effective_capacity ? String(room.effective_capacity) : ''
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this room?')) return;
        await roomsApi.delete(id);
        load();
    };

    // XLSX Import handlers
    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setImportFile(file);
        setError('');
        setSuccess('');

        // Read file and detect columns
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const base64 = evt.target.result.split(',')[1];
                const result = await configApi.detectColumns(base64);
                setImportSheets(result.sheets || []);
                if (result.sheets && result.sheets.length > 0) {
                    setSelectedSheet(result.sheets[0].name);
                    autoDetectColumns(result.sheets[0].headers);
                }
            } catch (err) {
                setError('Failed to read XLSX file: ' + err.message);
            }
        };
        reader.readAsDataURL(file);
    };

    const autoDetectColumns = (headers) => {
        const mapping = { roomCode: '', rows: '', columns: '', effectiveCapacity: '' };
        headers.forEach(h => {
            const name = (h.name || '').toLowerCase();
            if (name.includes('room') && (name.includes('code') || name.includes('no') || name.includes('number'))) {
                mapping.roomCode = h.col;
            } else if (name === 'rows' || name === 'row') {
                mapping.rows = h.col;
            } else if (name === 'columns' || name === 'column' || name === 'cols' || name.includes('bench')) {
                mapping.columns = h.col;
            } else if (name.includes('effective') || name.includes('limit') || name.includes('max')) {
                mapping.effectiveCapacity = h.col;
            }
        });
        setColumnMapping(mapping);
    };

    const handleSheetChange = (sheetName) => {
        setSelectedSheet(sheetName);
        const sheet = importSheets.find(s => s.name === sheetName);
        if (sheet) {
            autoDetectColumns(sheet.headers);
        }
    };

    const handleImport = async () => {
        if (!importFile || !columnMapping.roomCode || !columnMapping.rows || !columnMapping.columns) {
            setError('Please select a file and map required columns (Room Code, Rows, Columns)');
            return;
        }

        setImportLoading(true);
        setError('');
        setSuccess('');

        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const base64 = evt.target.result.split(',')[1];
                    const result = await configApi.importRooms({
                        fileData: base64,
                        columnMapping: {
                            roomCode: Number(columnMapping.roomCode),
                            rows: Number(columnMapping.rows),
                            columns: Number(columnMapping.columns),
                            effectiveCapacity: columnMapping.effectiveCapacity ? Number(columnMapping.effectiveCapacity) : null
                        },
                        sheetName: selectedSheet
                    });

                    setSuccess(`Import complete: ${result.created} created, ${result.updated} updated`);
                    if (result.errors && result.errors.length > 0) {
                        setError('Some errors occurred: ' + result.errors.join(', '));
                    }
                    setShowImport(false);
                    setImportFile(null);
                    setImportSheets([]);
                    load();
                } catch (err) {
                    setError('Import failed: ' + err.message);
                }
                setImportLoading(false);
            };
            reader.readAsDataURL(importFile);
        } catch (err) {
            setError('Import failed: ' + err.message);
            setImportLoading(false);
        }
    };

    const currentSheetHeaders = importSheets.find(s => s.name === selectedSheet)?.headers || [];

    return (
        <div>
            <div className="page-header">
                <h2>Rooms</h2>
                <button className="btn btn-primary" onClick={() => setShowImport(!showImport)}>
                    {showImport ? 'Cancel Import' : 'Import from XLSX'}
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {/* XLSX Import Section */}
            {showImport && (
                <div className="card" style={{ backgroundColor: '#f8f9fa', border: '2px dashed #dee2e6' }}>
                    <h3>Import Rooms from XLSX</h3>
                    <p style={{ color: '#666', marginBottom: '16px' }}>
                        Upload an XLSX file with columns: Room Code, Rows, Columns, and optionally Effective Capacity
                    </p>

                    <div className="form-group">
                        <label>Select XLSX File</label>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                        />
                    </div>

                    {importSheets.length > 0 && (
                        <>
                            <div className="form-group">
                                <label>Select Sheet</label>
                                <select value={selectedSheet} onChange={e => handleSheetChange(e.target.value)}>
                                    {importSheets.map(s => (
                                        <option key={s.name} value={s.name}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <h4 style={{ marginTop: '16px' }}>Map Columns</h4>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Room Code *</label>
                                    <select
                                        value={columnMapping.roomCode}
                                        onChange={e => setColumnMapping({ ...columnMapping, roomCode: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Select --</option>
                                        {currentSheetHeaders.map(h => (
                                            <option key={h.col} value={h.col}>{h.name || `Column ${h.col}`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Rows *</label>
                                    <select
                                        value={columnMapping.rows}
                                        onChange={e => setColumnMapping({ ...columnMapping, rows: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Select --</option>
                                        {currentSheetHeaders.map(h => (
                                            <option key={h.col} value={h.col}>{h.name || `Column ${h.col}`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Columns *</label>
                                    <select
                                        value={columnMapping.columns}
                                        onChange={e => setColumnMapping({ ...columnMapping, columns: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Select --</option>
                                        {currentSheetHeaders.map(h => (
                                            <option key={h.col} value={h.col}>{h.name || `Column ${h.col}`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Effective Capacity (optional)</label>
                                    <select
                                        value={columnMapping.effectiveCapacity}
                                        onChange={e => setColumnMapping({ ...columnMapping, effectiveCapacity: e.target.value })}
                                    >
                                        <option value="">-- None --</option>
                                        {currentSheetHeaders.map(h => (
                                            <option key={h.col} value={h.col}>{h.name || `Column ${h.col}`}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="btn-group">
                                <button
                                    className="btn btn-primary"
                                    onClick={handleImport}
                                    disabled={importLoading}
                                >
                                    {importLoading ? 'Importing...' : 'Import Rooms'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="card">
                <h3>{editing ? 'Edit Room' : 'Add Room'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Room Code</label>
                            <input value={form.roomCode} onChange={e => setForm({ ...form, roomCode: e.target.value })}
                                placeholder="e.g. AS201" required />
                        </div>
                        <div className="form-group">
                            <label>Rows</label>
                            <input type="number" min="1" value={form.rows}
                                onChange={e => setForm({ ...form, rows: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Columns (benches)</label>
                            <input type="number" min="1" value={form.columns}
                                onChange={e => setForm({ ...form, columns: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Effective Capacity (optional)</label>
                            <input
                                type="number"
                                min="1"
                                value={form.effectiveCapacity}
                                onChange={e => setForm({ ...form, effectiveCapacity: e.target.value })}
                                placeholder="Leave blank for full capacity"
                            />
                        </div>
                    </div>
                    <div className="btn-group">
                        <button className="btn btn-primary" type="submit">
                            {editing ? 'Update' : 'Add Room'}
                        </button>
                        {editing && (
                            <button className="btn btn-outline" type="button"
                                onClick={() => { setEditing(null); setForm({ roomCode: '', rows: '', columns: '', effectiveCapacity: '' }); }}>
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="card">
                <h3>All Rooms</h3>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Room Code</th>
                                <th>Rows</th>
                                <th>Columns</th>
                                <th>Benches</th>
                                <th>Total Capacity</th>
                                <th>Effective Capacity</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rooms.map(r => (
                                <tr key={r.id}>
                                    <td><strong>{r.room_code}</strong></td>
                                    <td>{r.rows}</td>
                                    <td>{r.columns}</td>
                                    <td>{r.rows * r.columns}</td>
                                    <td>{r.total_capacity}</td>
                                    <td>
                                        {r.effective_capacity !== null && r.effective_capacity !== undefined
                                            ? <span style={{ color: r.effective_capacity < r.total_capacity ? '#e67e22' : 'inherit' }}>
                                                {r.effective_capacity}
                                                {r.effective_capacity < r.total_capacity && ' (limited)'}
                                            </span>
                                            : <span style={{ color: '#999' }}>Full ({r.total_capacity})</span>
                                        }
                                    </td>
                                    <td>
                                        <button className="btn btn-outline btn-sm" onClick={() => handleEdit(r)}>Edit</button>{' '}
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {rooms.length === 0 && (
                                <tr><td colSpan="7" style={{ textAlign: 'center', color: '#999' }}>No rooms yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
