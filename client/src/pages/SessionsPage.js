import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsApi } from '../api';

export default function SessionsPage() {
    const [sessions, setSessions] = useState([]);
    const [form, setForm] = useState({
        sessionName: '', examDate: '', startTime: '', endTime: '', seatingMode: 'SINGLE', allocationMethod: 'INTERLEAVED'
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const load = () => sessionsApi.getAll().then(setSessions).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const session = await sessionsApi.create(form);
            setForm({ sessionName: '', examDate: '', startTime: '', endTime: '', seatingMode: 'SINGLE', allocationMethod: 'INTERLEAVED' });
            navigate(`/sessions/${session.id}`);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this session and all its data?')) return;
        await sessionsApi.delete(id);
        load();
    };

    return (
        <div>
            <div className="page-header"><h2>Exam Sessions</h2></div>
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="card">
                <h3>Create New Session</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Session Name</label>
                            <input value={form.sessionName} onChange={e => setForm({ ...form, sessionName: e.target.value })}
                                placeholder="e.g. Mid-Sem Dec 2025 – Slot A" required />
                        </div>
                        <div className="form-group">
                            <label>Exam Date</label>
                            <input type="date" value={form.examDate}
                                onChange={e => setForm({ ...form, examDate: e.target.value })} required />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Start Time</label>
                            <input type="time" value={form.startTime}
                                onChange={e => setForm({ ...form, startTime: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>End Time</label>
                            <input type="time" value={form.endTime}
                                onChange={e => setForm({ ...form, endTime: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Seating Mode</label>
                            <select value={form.seatingMode}
                                onChange={e => setForm({ ...form, seatingMode: e.target.value })}>
                                <option value="SINGLE">SINGLE (1 per bench)</option>
                                <option value="DOUBLE">DOUBLE (2 per bench, different subjects)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Allocation Method</label>
                            <select value={form.allocationMethod}
                                onChange={e => setForm({ ...form, allocationMethod: e.target.value })}>
                                <option value="INTERLEAVED">INTERLEAVED (mix subjects for spacing)</option>
                                <option value="LINEAR">LINEAR (contiguous blocks per branch)</option>
                            </select>
                        </div>
                    </div>
                    <div className="btn-group">
                        <button className="btn btn-primary" type="submit">Create Session</button>
                    </div>
                </form>
            </div>

            <div className="card">
                <h3>All Sessions</h3>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Session</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Mode</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map(s => (
                                <tr key={s.id}>
                                    <td>
                                        <a href={`/sessions/${s.id}`} onClick={e => { e.preventDefault(); navigate(`/sessions/${s.id}`); }}>
                                            <strong>{s.session_name}</strong>
                                        </a>
                                    </td>
                                    <td>{s.exam_date}</td>
                                    <td>{s.start_time && s.end_time ? `${s.start_time} – ${s.end_time}` : '—'}</td>
                                    <td><span className="badge badge-info">{s.seating_mode}</span></td>
                                    <td><span className="badge badge-info">{s.allocation_method || 'INTERLEAVED'}</span></td>
                                    <td>
                                        <span className={`badge ${s.status === 'ALLOCATED' ? 'badge-success' :
                                            s.status === 'LOCKED' ? 'badge-warning' : 'badge-info'
                                            }`}>{s.status}</span>
                                    </td>
                                    <td>
                                        <button className="btn btn-outline btn-sm"
                                            onClick={() => navigate(`/sessions/${s.id}`)}>Open</button>{' '}
                                        <button className="btn btn-danger btn-sm"
                                            onClick={() => handleDelete(s.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {sessions.length === 0 && (
                                <tr><td colSpan="7" style={{ textAlign: 'center', color: '#999' }}>No sessions yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
