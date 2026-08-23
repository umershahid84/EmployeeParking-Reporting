const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { createSetupToken } = require('../utils/accountSetup');
const { sendAccountSetupEmail } = require('../utils/email');

const router = express.Router();

// All routes here require administrator.
router.use(requireAuth, requireMinRole('administrator'));

// GET /api/users
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active, u.created_at, u.updated_at, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     ORDER BY u.name`
  );
  res.json({ users: rows });
});

// POST /api/users
// New accounts never receive a plain-text password: a random, unusable
// password hash is set, and a one-time secure setup link is emailed instead.
router.post('/', async (req, res) => {
  const { name, email, role } = req.body || {};
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required.' });
  }

  const [roleRows] = await pool.query('SELECT id FROM roles WHERE name = ?', [role]);
  if (!roleRows[0]) return res.status(400).json({ error: 'Invalid role.' });

  const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const normalizedEmail = email.toLowerCase().trim();

  let userId;
  try {
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)',
      [name, normalizedEmail, unusablePasswordHash, roleRows[0].id]
    );
    userId = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with that email already exists.' });
    throw err;
  }

  await recordAudit({ userId: req.user.id, action: 'user_created', entity: 'user', entityId: userId, details: { email: normalizedEmail, role }, ipAddress: req.ip });

  const setupToken = await createSetupToken(userId, 'initial_setup');
  await sendAccountSetupEmail({ toEmail: normalizedEmail, name, setupToken, userId, isReset: false });
  await recordAudit({ userId: req.user.id, action: 'user_creation_email_sent', entity: 'user', entityId: userId, details: { email: normalizedEmail }, ipAddress: req.ip });

  res.status(201).json({ id: userId });
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const { name, email, role, isActive } = req.body || {};
  const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'User not found.' });

  let roleId = existing[0].role_id;
  if (role) {
    const [roleRows] = await pool.query('SELECT id FROM roles WHERE name = ?', [role]);
    if (!roleRows[0]) return res.status(400).json({ error: 'Invalid role.' });
    roleId = roleRows[0].id;
  }

  await pool.query(
    `UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role_id = ?, is_active = COALESCE(?, is_active) WHERE id = ?`,
    [name ?? null, email ? email.toLowerCase().trim() : null, roleId, typeof isActive === 'boolean' ? isActive : null, req.params.id]
  );
  await recordAudit({ userId: req.user.id, action: 'user_updated', entity: 'user', entityId: req.params.id, details: req.body, ipAddress: req.ip });
  res.json({ ok: true });
});

// POST /api/users/:id/reset-account - admin-initiated account reset.
// Immediately invalidates the current password and emails a new one-time
// secure setup link, rather than a plain-text temporary password.
router.post('/:id/reset-account', async (req, res) => {
  const [existing] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [req.params.id]);
  const user = existing[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [unusablePasswordHash, req.params.id]);
  await recordAudit({ userId: req.user.id, action: 'user_account_reset', entity: 'user', entityId: req.params.id, ipAddress: req.ip });

  const setupToken = await createSetupToken(user.id, 'admin_reset');
  await sendAccountSetupEmail({ toEmail: user.email, name: user.name, setupToken, userId: user.id, isReset: true });
  await recordAudit({ userId: req.user.id, action: 'user_reset_email_sent', entity: 'user', entityId: user.id, details: { email: user.email }, ipAddress: req.ip });

  res.json({ ok: true });
});

module.exports = router;
