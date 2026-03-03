/**
 * EXPRESS SERVER ENTRY POINT
 * ==========================
 * Starts the API server and serves the React frontend in production.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const { closeDb } = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── API ROUTES ───────────────────────────────────────────────
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/config', require('./routes/config'));

// ── SERVE REACT BUILD IN PRODUCTION ──────────────────────────
const clientBuild = path.resolve(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    // if (!req.path.startsWith('/api')) {
    //     res.sendFile(path.join(clientBuild, 'index.html'));
    // }    
    res.send({ message: `Working on Port http://localhost:${PORT}  ` })
});

// ── ERROR HANDLER ────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   EXAM SEATING ARRANGEMENT SYSTEM             ║
  ║   Server running on http://localhost:${PORT}     ║
  ╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeDb();
    process.exit(0);
});

module.exports = app;
