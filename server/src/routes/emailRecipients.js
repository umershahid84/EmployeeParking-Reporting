const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');

const router = express.Router();

// All routes here require administrator.
router.use(requireAuth, requireMinRole('administrator'));

// GET /api/email-recipients
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, notification_type, is_active, created_at, updated_at FROM email_recipients ORDER BY email'
  );
  res.json({ recipients: rows });
});

// POST /api/email-recipients
router.post('/', async (req, res) => {
  const { email, notificationType } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const normalizedEmail = email.toLowerCase().trim();
  try {
    const [result] = await pool.query(
      'INSERT INTO email_recipients (email, notification_type) VALUES (?, ?)',
      [normalizedEmail, notificationType || 'daily_report']
    );
    await recordAudit({ userId: req.user.id, action: 'email_recipient_added', entity: 'email_recipient', entityId: result.insertId, details: { email: normalizedEmail }, ipAddress: req.ip });
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email address is already on the list.' });
    throw err;
  }
});

// PUT /api/email-recipients/:id
router.put('/:id', async (req, res) => {
  const { email, isActive } = req.body || {};
  const [existing] = await pool.query('SELECT * FROM email_recipients WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Recipient not found.' });

  try {
    await pool.query(
      'UPDATE email_recipients SET email = COALESCE(?, email), is_active = COALESCE(?, is_active) WHERE id = ?',
      [email ? email.toLowerCase().trim() : null, typeof isActive === 'boolean' ? isActive : null, req.params.id]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email address is already on the list.' });
    throw err;
  }
  await recordAudit({ userId: req.user.id, action: 'email_recipient_updated', entity: 'email_recipient', entityId: req.params.id, details: req.body, ipAddress: req.ip });
  res.json({ ok: true });
});

// DELETE /api/email-recipients/:id
router.delete('/:id', async (req, res) => {
  const [existing] = await pool.query('SELECT id, email FROM email_recipients WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Recipient not found.' });

  await pool.query('DELETE FROM email_recipients WHERE id = ?', [req.params.id]);
  await recordAudit({ userId: req.user.id, action: 'email_recipient_removed', entity: 'email_recipient', entityId: req.params.id, details: { email: existing[0].email }, ipAddress: req.ip });
  res.json({ ok: true });
});

module.exports = router;
