import React, { useState, useEffect } from 'react';
import { branchesApi } from '../api';

export default function BranchesPage() {
    const [branches, setBranches] = useState([]);
    const [form, setForm] = useState({ branchCode: '', branchName: '' });
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');

    const load = () => branchesApi.getAll().then(setBranches).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (editing) {
                await branchesApi.update(editing, form);
            } else {
                await branchesApi.create(form);
            }
            setForm({ branchCode: '', branchName: '' });
            setEditing(null);
            load();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEdit = (b) => {
        setEditing(b.id);
        setForm({ branchCode: b.branch_code, branchName: b.branch_name });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this branch?')) return;
        await branchesApi.delete(id);
        load();
    };

    return (
        <div>
            <div className="page-header"><h2>Branches</h2></div>
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="card">
                <h3>{editing ? 'Edit Branch' : 'Add Branch'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Branch Code</label>
                            <input value={form.branchCode} onChange={e => setForm({ ...form, branchCode: e.target.value })}
                                placeholder="e.g. CSE" required />
                        </div>
                        <div className="form-group">
                            <label>Branch Name</label>
                            <input value={form.branchName} onChange={e => setForm({ ...form, branchName: e.target.value })}
                                placeholder="e.g. Computer Science & Engineering" required />
                        </div>
                    </div>
                    <div className="btn-group">
                        <button className="btn btn-primary" type="submit">{editing ? 'Update' : 'Add Branch'}</button>
                        {editing && (
                            <button className="btn btn-outline" type="button"
                                onClick={() => { setEditing(null); setForm({ branchCode: '', branchName: '' }); }}>Cancel</button>
                        )}
                    </div>
                </form>
            </div>

            <div className="card">
                <h3>All Branches</h3>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr><th>Code</th><th>Name</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {branches.map(b => (
                                <tr key={b.id}>
                                    <td><strong>{b.branch_code}</strong></td>
                                    <td>{b.branch_name}</td>
                                    <td>
                                        <button className="btn btn-outline btn-sm" onClick={() => handleEdit(b)}>Edit</button>{' '}
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {branches.length === 0 && (
                                <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No branches yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
