const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/drivers?includeInactive=1
router.get('/', requireAuth, async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' && req.user.role !== 'supervisor';
  const [rows] = await pool.query(
    `SELECT id, driver_name, employee_id, is_active FROM drivers
     ${includeInactive ? '' : 'WHERE is_active = 1'}
     ORDER BY driver_name`
  );
  res.json({ drivers: rows });
});

// POST /api/drivers (administrator)
router.post('/', requireAuth, requireMinRole('administrator'), async (req, res) => {
  const { driverName, employeeId } = req.body || {};
  if (!driverName) return res.status(400).json({ error: 'Driver name is required.' });

  const [result] = await pool.query(
    'INSERT INTO drivers (driver_name, employee_id) VALUES (?, ?)',
    [driverName, employeeId || null]
  );
  await recordAudit({ userId: req.user.id, action: 'driver_created', entity: 'driver', entityId: result.insertId, details: { driverName }, ipAddress: req.ip });
  res.status(201).json({ id: result.insertId });
});

// PUT /api/drivers/:id (administrator)
router.put('/:id', requireAuth, requireMinRole('administrator'), async (req, res) => {
  const { driverName, employeeId, isActive } = req.body || {};
  const [existing] = await pool.query('SELECT * FROM drivers WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Driver not found.' });

  await pool.query(
    'UPDATE drivers SET driver_name = COALESCE(?, driver_name), employee_id = ?, is_active = COALESCE(?, is_active) WHERE id = ?',
    [driverName ?? null, employeeId ?? existing[0].employee_id, typeof isActive === 'boolean' ? isActive : null, req.params.id]
  );
  await recordAudit({ userId: req.user.id, action: 'driver_updated', entity: 'driver', entityId: req.params.id, details: req.body, ipAddress: req.ip });
  res.json({ ok: true });
});

module.exports = router;
