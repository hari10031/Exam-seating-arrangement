import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';
import RoomsPage from './pages/RoomsPage';
import BranchesPage from './pages/BranchesPage';
import SubjectsPage from './pages/SubjectsPage';
import SessionsPage from './pages/SessionsPage';
import SessionDetail from './pages/SessionDetail';
import Dashboard from './pages/Dashboard';

function App() {
    return (
        <BrowserRouter>
            <div className="app">
                <nav className="sidebar">
                    <h2>Exam Seating</h2>
                    <NavLink to="/" end>Dashboard</NavLink>
                    <NavLink to="/rooms">Rooms</NavLink>
                    <NavLink to="/branches">Branches</NavLink>
                    <NavLink to="/subjects">Subjects</NavLink>
                    <NavLink to="/sessions">Exam Sessions</NavLink>
                </nav>
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/rooms" element={<RoomsPage />} />
                        <Route path="/branches" element={<BranchesPage />} />
                        <Route path="/subjects" element={<SubjectsPage />} />
                        <Route path="/sessions" element={<SessionsPage />} />
                        <Route path="/sessions/:id" element={<SessionDetail />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
