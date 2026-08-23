const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit - administrator only
router.get('/', requireAuth, requireMinRole('administrator'), async (req, res) => {
  const { action, userId, entity, limit } = req.query;
  const where = [];
  const params = [];
  if (action) { where.push('a.action = ?'); params.push(action); }
  if (userId) { where.push('a.user_id = ?'); params.push(userId); }
  if (entity) { where.push('a.entity = ?'); params.push(entity); }

  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip_address, a.created_at, u.name AS user_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [...params, Math.min(Number(limit) || 200, 1000)]
  );
  res.json({ logs: rows });
});

module.exports = router;
