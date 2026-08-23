const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/supervisors - active supervisors, for the Incoming Supervisor(s)
// picker. Deliberately narrow (id + name only) since any authenticated user
// can call this, unlike the full /api/users admin listing.
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'supervisor' AND u.is_active = 1
     ORDER BY u.name`
  );
  res.json({ supervisors: rows });
});

module.exports = router;
