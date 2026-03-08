import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsApi, configApi } from '../api';

export default function SessionsPage() {
    const [sessions, setSessions] = useState([]);
    const [form, setForm] = useState({
        sessionName: '', examDate: '', slot: '', seatingMode: 'SINGLE', allocationMethod: 'INTERLEAVED', year: ''
    });
    const [timetableYears, setTimetableYears] = useState([]);
    const [timetableDates, setTimetableDates] = useState([]);
    const [timetableSlots, setTimetableSlots] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const load = () => sessionsApi.getAll().then(setSessions).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);

    // Load timetable years on mount
    useEffect(() => {
        configApi.getTimetableYears().then(setTimetableYears).catch(() => setTimetableYears([]));
    }, []);

    // When year changes, load dates for that year
    useEffect(() => {
        if (!form.year) { setTimetableDates([]); setTimetableSlots([]); return; }
        configApi.getTimetableDates(form.year)
            .then(setTimetableDates)
            .catch(() => setTimetableDates([]));
        setForm(f => ({ ...f, examDate: '', slot: '' }));
        setTimetableSlots([]);
    }, [form.year]);

    // When date changes, load slots for that date + year
    useEffect(() => {
        if (!form.examDate) { setTimetableSlots([]); return; }
        configApi.getTimetableSlots(form.examDate, form.year)
            .then(setTimetableSlots)
            .catch(() => setTimetableSlots([]));
        setForm(f => ({ ...f, slot: '' }));
    }, [form.examDate, form.year]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const session = await sessionsApi.create({
                sessionName: form.sessionName,
                examDate: form.examDate,
                seatingMode: form.seatingMode,
                allocationMethod: form.allocationMethod,
                year: form.year ? Number(form.year) : null,
                slot: form.slot || null
            });
            setForm({ sessionName: '', examDate: '', slot: '', seatingMode: 'SINGLE', allocationMethod: 'INTERLEAVED', year: '' });
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
                                placeholder="e.g. Mid-Sem Dec 2025 – CIE-I" required />
                        </div>
                        <div className="form-group">
                            <label>Year</label>
                            <select value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} required>
                                <option value="">— Select Year —</option>
                                {timetableYears.length > 0
                                    ? timetableYears.map(y => <option key={y} value={y}>Year {y}</option>)
                                    : [1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)
                                }
                            </select>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Exam Date</label>
                            {timetableDates.length > 0 ? (
                                <select value={form.examDate} onChange={e => setForm({ ...form, examDate: e.target.value })} required>
                                    <option value="">— Select Date —</option>
                                    {timetableDates.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            ) : (
                                <input type="date" value={form.examDate}
                                    onChange={e => setForm({ ...form, examDate: e.target.value })} required />
                            )}
                        </div>
                        <div className="form-group">
                            <label>Slot</label>
                            {timetableSlots.length > 0 ? (
                                <select value={form.slot} onChange={e => setForm({ ...form, slot: e.target.value })} required>
                                    <option value="">— Select Slot —</option>
                                    {timetableSlots.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            ) : (
                                <select value={form.slot} onChange={e => setForm({ ...form, slot: e.target.value })}>
                                    <option value="">— No slot —</option>
                                    <option value="10:00-11:10">10:00-11:10</option>
                                    <option value="11:30-12:40">11:30-12:40</option>
                                    <option value="1:00-2:10">1:00-2:10</option>
                                    <option value="2:30-3:40">2:30-3:40</option>
                                </select>
                            )}
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
                                <th>Slot</th>
                                <th>Year</th>
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
                                    <td>{s.slot || '—'}</td>
                                    <td>{s.year ? `Year ${s.year}` : '—'}</td>
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
                                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#999' }}>No sessions yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
