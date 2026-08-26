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

// When deployed behind a reverse proxy (e.g. Apache proxying /epreport to
// this app), the proxy sets X-Forwarded-For to the real client IP - but
// Express ignores that header by default (and express-rate-limit refuses
// to start up if it sees the header with trust proxy still off, since
// trusting it blindly would let a client spoof their own rate-limit
// identity). TRUST_PROXY tells Express how many hops of proxy to trust:
// set it to "1" when there's exactly one reverse proxy in front of the
// app (the common case), or leave it unset to keep trusting nothing (the
// right choice when the app is reachable directly, with no proxy).
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  const numeric = Number(value);
  app.set('trust proxy', Number.isInteger(numeric) && String(numeric) === value ? numeric : value);
}

// The built client is served from the same origin in production, so CSP's
// default-src restrictions are relaxed only enough for that same-origin
// bundle; cross-origin API access (e.g. a separate dev client) still goes
// through CORS below.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Everything below is mounted under BASE_PATH so the whole app can be
// reverse-proxied at a sub-path (e.g. Apache proxying /epreport straight
// through to this server) instead of only ever living at the domain root.
// Leave BASE_PATH unset (or "/") to serve from the root as before - that's
// the default and requires no Apache/BASE_PATH changes at all.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const router = express.Router();

router.get('/api/health', (req, res) => res.json({ ok: true }));

router.use('/api/auth', authRoutes);
router.use('/api/reports', reportRoutes);
router.use('/api/drivers', driverRoutes);
router.use('/api/shuttles', shuttleRoutes);
router.use('/api/shifts', shiftRoutes);
router.use('/api/users', userRoutes);
router.use('/api/supervisors', supervisorRoutes);
router.use('/api/email-recipients', emailRecipientRoutes);
router.use('/api/analytics', analyticsRoutes);
router.use('/api/audit', auditRoutes);

// Any /api/* request that didn't match a route above is a genuine 404,
// not a client-side route to hand off to the SPA.
router.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React client (client/dist) as one application. In a dev
// environment where the client hasn't been built yet (e.g. `vite dev` is
// used instead), this block is simply skipped.
const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  router.use(express.static(clientDistPath));
  router.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

if (BASE_PATH) {
  app.use(BASE_PATH, router);
} else {
  app.use(router);
}

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

module.exports = app;
