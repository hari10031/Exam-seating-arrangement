import React, { useState, useEffect } from 'react';
import { roomsApi, branchesApi, subjectsApi, sessionsApi } from '../api';

export default function Dashboard() {
    const [stats, setStats] = useState({ rooms: 0, branches: 0, subjects: 0, sessions: [] });

    useEffect(() => {
        Promise.all([
            roomsApi.getAll(),
            branchesApi.getAll(),
            subjectsApi.getAll(),
            sessionsApi.getAll()
        ]).then(([rooms, branches, subjects, sessions]) => {
            setStats({ rooms: rooms.length, branches: branches.length, subjects: subjects.length, sessions });
        }).catch(console.error);
    }, []);

    return (
        <div>
            <div className="page-header">
                <h2>Dashboard</h2>
            </div>

            <div className="report-grid">
                <div className="report-stat">
                    <div className="number">{stats.rooms}</div>
                    <div className="label">Rooms</div>
                </div>
                <div className="report-stat">
                    <div className="number">{stats.branches}</div>
                    <div className="label">Branches</div>
                </div>
                <div className="report-stat">
                    <div className="number">{stats.subjects}</div>
                    <div className="label">Subjects</div>
                </div>
                <div className="report-stat">
                    <div className="number">{stats.sessions.length}</div>
                    <div className="label">Exam Sessions</div>
                </div>
            </div>

            {stats.sessions.length > 0 && (
                <div className="card">
                    <h3>Recent Sessions</h3>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Session</th>
                                    <th>Date</th>
                                    <th>Mode</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.sessions.slice(0, 5).map(s => (
                                    <tr key={s.id}>
                                        <td><a href={`/sessions/${s.id}`}>{s.session_name}</a></td>
                                        <td>{s.exam_date}</td>
                                        <td><span className="badge badge-info">{s.seating_mode}</span></td>
                                        <td>
                                            <span className={`badge ${s.status === 'ALLOCATED' ? 'badge-success' : 'badge-warning'}`}>
                                                {s.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
