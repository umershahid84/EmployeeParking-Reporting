require('express-async-errors');
require('./config/env');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const driverRoutes = require('./routes/drivers');
const shuttleRoutes = require('./routes/shuttles');
const shiftRoutes = require('./routes/shifts');
const userRoutes = require('./routes/users');
const supervisorRoutes = require('./routes/supervisors');
const emailRecipientRoutes = require('./routes/emailRecipients');
const analyticsRoutes = require('./routes/analytics');
const auditRoutes = require('./routes/audit');

const app = express();

// The built client is served from the same origin in production, so CSP's
// default-src restrictions are relaxed only enough for that same-origin
// bundle; cross-origin API access (e.g. a separate dev client) still goes
// through CORS below.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/shuttles', shuttleRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/users', userRoutes);
app.use('/api/supervisors', supervisorRoutes);
app.use('/api/email-recipients', emailRecipientRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit', auditRoutes);

// Any /api/* request that didn't match a route above is a genuine 404,
// not a client-side route to hand off to the SPA.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React client (client/dist) as one application. In a dev
// environment where the client hasn't been built yet (e.g. `vite dev` is
// used instead), this block is simply skipped.
const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

module.exports = app;
