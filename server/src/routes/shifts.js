const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/shifts
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM shifts ORDER BY id');
  res.json({ shifts: rows });
});

module.exports = router;
