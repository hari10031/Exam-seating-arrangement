import React, { useState, useEffect } from 'react';
import { roomsApi } from '../api';

export default function RoomsPage() {
    const [rooms, setRooms] = useState([]);
    const [form, setForm] = useState({ roomCode: '', rows: '', columns: '' });
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');

    const load = () => roomsApi.getAll().then(setRooms).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (editing) {
                await roomsApi.update(editing, form);
            } else {
                await roomsApi.create(form);
            }
            setForm({ roomCode: '', rows: '', columns: '' });
            setEditing(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEdit = (room) => {
        setEditing(room.id);
        setForm({ roomCode: room.room_code, rows: String(room.rows), columns: String(room.columns) });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this room?')) return;
        await roomsApi.delete(id);
        load();
    };

    return (
        <div>
            <div className="page-header">
                <h2>Rooms</h2>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

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
                    </div>
                    <div className="btn-group">
                        <button className="btn btn-primary" type="submit">
                            {editing ? 'Update' : 'Add Room'}
                        </button>
                        {editing && (
                            <button className="btn btn-outline" type="button"
                                onClick={() => { setEditing(null); setForm({ roomCode: '', rows: '', columns: '' }); }}>
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
                                <th>Capacity (Single)</th>
                                <th>Capacity (Double)</th>
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
                                    <td>{r.rows * r.columns}</td>
                                    <td>{r.rows * r.columns * 2}</td>
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
