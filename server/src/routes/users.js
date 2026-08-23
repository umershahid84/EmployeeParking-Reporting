const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');

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
router.post('/', async (req, res) => {
  const { name, email, role, temporaryPassword } = req.body || {};
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required.' });
  }

  const [roleRows] = await pool.query('SELECT id FROM roles WHERE name = ?', [role]);
  if (!roleRows[0]) return res.status(400).json({ error: 'Invalid role.' });

  const password = temporaryPassword || crypto.randomBytes(9).toString('base64');
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)',
      [name, email.toLowerCase().trim(), passwordHash, roleRows[0].id]
    );
    await recordAudit({ userId: req.user.id, action: 'user_created', entity: 'user', entityId: result.insertId, details: { email, role }, ipAddress: req.ip });
    res.status(201).json({ id: result.insertId, temporaryPassword: temporaryPassword ? undefined : password });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with that email already exists.' });
    throw err;
  }
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

// POST /api/users/:id/reset-account - admin-initiated password reset
router.post('/:id/reset-account', async (req, res) => {
  const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'User not found.' });

  const tempPassword = crypto.randomBytes(9).toString('base64');
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
  await recordAudit({ userId: req.user.id, action: 'user_account_reset', entity: 'user', entityId: req.params.id, ipAddress: req.ip });

  res.json({ ok: true, temporaryPassword: tempPassword });
});

module.exports = router;
