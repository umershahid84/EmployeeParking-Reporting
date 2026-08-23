const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { sendPasswordResetCode } = require('../utils/email');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const resetRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const resetVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
    }
  );
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.is_active, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.email = ?`,
    [email.toLowerCase().trim()]
  );
  const user = rows[0];

  if (!user || !user.is_active) {
    await recordAudit({ action: 'login_failed', details: { email }, ipAddress: req.ip });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await recordAudit({ userId: user.id, action: 'login_failed', ipAddress: req.ip });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken(user);
  await recordAudit({ userId: user.id, action: 'login', ipAddress: req.ip });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  await recordAudit({ userId: req.user.id, action: 'logout', ipAddress: req.ip });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const user = rows[0];
  const valid = user && (await bcrypt.compare(currentPassword, user.password_hash));
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  await recordAudit({ userId: req.user.id, action: 'password_changed', ipAddress: req.ip });

  res.json({ ok: true });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', resetRequestLimiter, async (req, res) => {
  const { email } = req.body || {};
  const genericResponse = { ok: true, message: 'If that account exists, a reset code has been sent.' };
  if (!email) return res.json(genericResponse);

  const [rows] = await pool.query('SELECT id, email FROM users WHERE email = ? AND is_active = 1', [email.toLowerCase().trim()]);
  const user = rows[0];
  if (!user) {
    // Do not reveal whether the account exists.
    return res.json(genericResponse);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const ttlMinutes = Number(process.env.PASSWORD_RESET_CODE_TTL_MINUTES) || 15;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await pool.query(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)`,
    [user.id, codeHash, expiresAt]
  );

  await recordAudit({ userId: user.id, action: 'password_reset_requested', ipAddress: req.ip });

  try {
    await sendPasswordResetCode(user.email, code, ttlMinutes);
  } catch (err) {
    // Do not leak email delivery failures to the caller; still return generic response.
  }

  res.json(genericResponse);
});

// POST /api/auth/reset-password
router.post('/reset-password', resetVerifyLimiter, async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body || {};
  if (!email || !code || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const [userRows] = await pool.query('SELECT id FROM users WHERE email = ? AND is_active = 1', [email.toLowerCase().trim()]);
  const user = userRows[0];
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification code.' });
  }

  const [codeRows] = await pool.query(
    `SELECT * FROM password_reset_codes
     WHERE user_id = ? AND used = 0 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const resetRecord = codeRows[0];
  const maxAttempts = Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS) || 5;

  if (!resetRecord || resetRecord.attempt_count >= maxAttempts) {
    return res.status(400).json({ error: 'Invalid or expired verification code.' });
  }

  const codeValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!codeValid) {
    await pool.query('UPDATE password_reset_codes SET attempt_count = attempt_count + 1 WHERE id = ?', [resetRecord.id]);
    return res.status(400).json({ error: 'Invalid or expired verification code.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
  await pool.query('UPDATE password_reset_codes SET used = 1, used_at = NOW() WHERE id = ?', [resetRecord.id]);
  // Invalidate any other outstanding codes for this user.
  await pool.query('UPDATE password_reset_codes SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);

  await recordAudit({ userId: user.id, action: 'password_reset', ipAddress: req.ip });

  res.json({ ok: true, message: 'Your password has been successfully reset.' });
});

module.exports = router;
