import React, { useState, useEffect } from 'react';
import { subjectsApi } from '../api';

export default function SubjectsPage() {
    const [subjects, setSubjects] = useState([]);
    const [form, setForm] = useState({ subjectCode: '', subjectName: '' });
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');

    const load = () => subjectsApi.getAll().then(setSubjects).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (editing) {
                await subjectsApi.update(editing, form);
            } else {
                await subjectsApi.create(form);
            }
            setForm({ subjectCode: '', subjectName: '' });
            setEditing(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEdit = (s) => {
        setEditing(s.id);
        setForm({ subjectCode: s.subject_code, subjectName: s.subject_name });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this subject?')) return;
        await subjectsApi.delete(id);
        load();
    };

    return (
        <div>
            <div className="page-header"><h2>Subjects</h2></div>
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="card">
                <h3>{editing ? 'Edit Subject' : 'Add Subject'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Subject Code</label>
                            <input value={form.subjectCode} onChange={e => setForm({ ...form, subjectCode: e.target.value })}
                                placeholder="e.g. CS301" required />
                        </div>
                        <div className="form-group">
                            <label>Subject Name</label>
                            <input value={form.subjectName} onChange={e => setForm({ ...form, subjectName: e.target.value })}
                                placeholder="e.g. Data Structures" required />
                        </div>
                    </div>
                    <div className="btn-group">
                        <button className="btn btn-primary" type="submit">{editing ? 'Update' : 'Add Subject'}</button>
                        {editing && (
                            <button className="btn btn-outline" type="button"
                                onClick={() => { setEditing(null); setForm({ subjectCode: '', subjectName: '' }); }}>Cancel</button>
                        )}
                    </div>
                </form>
            </div>

            <div className="card">
                <h3>All Subjects</h3>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr><th>Code</th><th>Name</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {subjects.map(s => (
                                <tr key={s.id}>
                                    <td><strong>{s.subject_code}</strong></td>
                                    <td>{s.subject_name}</td>
                                    <td>
                                        <button className="btn btn-outline btn-sm" onClick={() => handleEdit(s)}>Edit</button>{' '}
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {subjects.length === 0 && (
                                <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No subjects yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
