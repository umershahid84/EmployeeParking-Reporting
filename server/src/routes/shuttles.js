const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/shuttles?includeInactive=1
router.get('/', requireAuth, async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' && req.user.role !== 'supervisor';
  const [rows] = await pool.query(
    `SELECT id, shuttle_number, is_active FROM shuttles
     ${includeInactive ? '' : 'WHERE is_active = 1'}
     ORDER BY shuttle_number`
  );
  res.json({ shuttles: rows });
});

// POST /api/shuttles (administrator)
router.post('/', requireAuth, requireMinRole('administrator'), async (req, res) => {
  const { shuttleNumber } = req.body || {};
  if (!shuttleNumber) return res.status(400).json({ error: 'Shuttle number is required.' });

  const [result] = await pool.query('INSERT INTO shuttles (shuttle_number) VALUES (?)', [shuttleNumber]);
  await recordAudit({ userId: req.user.id, action: 'shuttle_created', entity: 'shuttle', entityId: result.insertId, details: { shuttleNumber }, ipAddress: req.ip });
  res.status(201).json({ id: result.insertId });
});

// PUT /api/shuttles/:id (administrator)
router.put('/:id', requireAuth, requireMinRole('administrator'), async (req, res) => {
  const { shuttleNumber, isActive } = req.body || {};
  const [existing] = await pool.query('SELECT * FROM shuttles WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Shuttle not found.' });

  await pool.query(
    'UPDATE shuttles SET shuttle_number = COALESCE(?, shuttle_number), is_active = COALESCE(?, is_active) WHERE id = ?',
    [shuttleNumber ?? null, typeof isActive === 'boolean' ? isActive : null, req.params.id]
  );
  await recordAudit({ userId: req.user.id, action: 'shuttle_updated', entity: 'shuttle', entityId: req.params.id, details: req.body, ipAddress: req.ip });
  res.json({ ok: true });
});

module.exports = router;
