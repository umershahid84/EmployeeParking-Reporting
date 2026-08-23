require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const driverRoutes = require('./routes/drivers');
const shuttleRoutes = require('./routes/shuttles');
const shiftRoutes = require('./routes/shifts');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/shuttles', shuttleRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

module.exports = app;
