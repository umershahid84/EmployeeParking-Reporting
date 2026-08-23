const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/supervisors - supervisors, for the Incoming Supervisor(s) picker
// (active only) and the Analytics supervisor filter (which also needs
// inactive supervisors, so historical data stays filterable). Deliberately
// narrow (id + name only) since any authenticated user can call this,
// unlike the full /api/users admin listing.
router.get('/', requireAuth, async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' && req.user.role !== 'supervisor';
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.is_active
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'supervisor' ${includeInactive ? '' : 'AND u.is_active = 1'}
     ORDER BY u.name`
  );
  res.json({ supervisors: rows });
});

module.exports = router;
