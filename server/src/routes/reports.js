const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { recordHistory } = require('../utils/history');

const router = express.Router();

const REPORT_FIELDS = ['bus_issues', 'work_orders', 'significant_activity', 'incoming_supervisor', 'notes', 'status'];

async function loadReportFull(reportId) {
  const [reportRows] = await pool.query(
    `SELECT dr.*, s.name AS shift_name, u.name AS supervisor_name, u.email AS supervisor_email
     FROM daily_reports dr
     JOIN shifts s ON s.id = dr.shift_id
     JOIN users u ON u.id = dr.supervisor_id
     WHERE dr.id = ?`,
    [reportId]
  );
  const report = reportRows[0];
  if (!report) return null;

  const [callouts] = await pool.query(
    `SELECT c.id, c.notes, c.created_at,
            sh.id AS shuttle_id, sh.shuttle_number,
            dv.id AS driver_id, dv.driver_name
     FROM driver_callouts c
     LEFT JOIN shuttles sh ON sh.id = c.shuttle_id
     LEFT JOIN drivers dv ON dv.id = c.driver_id
     WHERE c.report_id = ? ORDER BY c.id`,
    [reportId]
  );

  const [shiftFills] = await pool.query(
    `SELECT f.id, f.coverage_type, f.notes, f.created_at,
            sh.id AS shuttle_id, sh.shuttle_number,
            dv.id AS driver_id, dv.driver_name,
            osh.id AS original_shuttle_id, osh.shuttle_number AS original_shuttle_number
     FROM driver_shift_fills f
     LEFT JOIN shuttles sh ON sh.id = f.shuttle_id
     LEFT JOIN drivers dv ON dv.id = f.driver_id
     LEFT JOIN shuttles osh ON osh.id = f.original_shuttle_id
     WHERE f.report_id = ? ORDER BY f.id`,
    [reportId]
  );

  const [comments] = await pool.query(
    `SELECT rc.id, rc.comment, rc.created_at, u.id AS user_id, u.name AS user_name, r.name AS user_role
     FROM report_comments rc
     JOIN users u ON u.id = rc.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE rc.report_id = ? ORDER BY rc.created_at`,
    [reportId]
  );

  const [history] = await pool.query(
    `SELECT h.id, h.action, h.field_changed, h.previous_value, h.new_value, h.created_at, u.name AS user_name
     FROM report_history h JOIN users u ON u.id = h.user_id
     WHERE h.report_id = ? ORDER BY h.created_at`,
    [reportId]
  );

  return { ...report, callouts, shiftFills, comments, history };
}

function canEdit(report, user) {
  if (user.role === 'administrator') return true;
  if (user.role === 'supervisor') return report.supervisor_id === user.id;
  return false; // managers can view/comment but not edit report content
}

// GET /api/reports - list with filters
router.get('/', requireAuth, async (req, res) => {
  const { date, dateFrom, dateTo, shiftId, supervisorId, driverId, shuttleId, status, hasCallouts, hasShiftFills } = req.query;
  const where = [];
  const params = [];

  if (date) { where.push('dr.report_date = ?'); params.push(date); }
  if (dateFrom) { where.push('dr.report_date >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('dr.report_date <= ?'); params.push(dateTo); }
  if (shiftId) { where.push('dr.shift_id = ?'); params.push(shiftId); }
  if (supervisorId) { where.push('dr.supervisor_id = ?'); params.push(supervisorId); }
  if (status) { where.push('dr.status = ?'); params.push(status); }
  if (driverId) {
    where.push('(EXISTS (SELECT 1 FROM driver_callouts c WHERE c.report_id = dr.id AND c.driver_id = ?) OR EXISTS (SELECT 1 FROM driver_shift_fills f WHERE f.report_id = dr.id AND f.driver_id = ?))');
    params.push(driverId, driverId);
  }
  if (shuttleId) {
    where.push('(EXISTS (SELECT 1 FROM driver_callouts c WHERE c.report_id = dr.id AND c.shuttle_id = ?) OR EXISTS (SELECT 1 FROM driver_shift_fills f WHERE f.report_id = dr.id AND (f.shuttle_id = ? OR f.original_shuttle_id = ?)))');
    params.push(shuttleId, shuttleId, shuttleId);
  }
  if (hasCallouts === '1') { where.push('EXISTS (SELECT 1 FROM driver_callouts c WHERE c.report_id = dr.id)'); }
  if (hasShiftFills === '1') { where.push('EXISTS (SELECT 1 FROM driver_shift_fills f WHERE f.report_id = dr.id)'); }

  const sql = `
    SELECT dr.id, dr.report_date, dr.status, dr.created_at, dr.updated_at,
           s.name AS shift_name, u.id AS supervisor_id, u.name AS supervisor_name
    FROM daily_reports dr
    JOIN shifts s ON s.id = dr.shift_id
    JOIN users u ON u.id = dr.supervisor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY dr.report_date DESC, dr.created_at DESC
    LIMIT 500`;

  const [rows] = await pool.query(sql, params);
  res.json({ reports: rows });
});

// GET /api/reports/:id
router.get('/:id', requireAuth, async (req, res) => {
  const report = await loadReportFull(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  res.json({ report: { ...report, canEdit: canEdit(report, req.user) } });
});

// POST /api/reports - create (supervisor or administrator)
router.post('/', requireAuth, requireMinRole('supervisor'), async (req, res) => {
  if (req.user.role === 'manager') return res.status(403).json({ error: 'Managers cannot create reports.' });

  const { reportDate, shiftId, status, busIssues, workOrders, significantActivity, incomingSupervisor, notes, callouts, shiftFills } = req.body || {};
  if (!reportDate || !shiftId) {
    return res.status(400).json({ error: 'Report date and shift are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO daily_reports (report_date, shift_id, supervisor_id, status, bus_issues, work_orders, significant_activity, incoming_supervisor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportDate, shiftId, req.user.id, status === 'draft' ? 'draft' : 'submitted', busIssues || null, workOrders || null, significantActivity || null, incomingSupervisor || null, notes || null]
    );
    const reportId = result.insertId;

    for (const c of callouts || []) {
      await conn.query(
        'INSERT INTO driver_callouts (report_id, shuttle_id, driver_id, notes) VALUES (?, ?, ?, ?)',
        [reportId, c.shuttleId || null, c.driverId || null, c.notes || null]
      );
    }
    for (const f of shiftFills || []) {
      await conn.query(
        `INSERT INTO driver_shift_fills (report_id, shuttle_id, driver_id, coverage_type, original_shuttle_id, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [reportId, f.shuttleId || null, f.driverId || null, f.coverageType === 'moved' ? 'moved' : 'assigned', f.coverageType === 'moved' ? (f.originalShuttleId || null) : null, f.notes || null]
      );
    }

    await conn.commit();

    await recordHistory({ reportId, userId: req.user.id, action: 'Report created' });
    await recordAudit({ userId: req.user.id, action: 'report_created', entity: 'daily_report', entityId: reportId, ipAddress: req.ip });

    const report = await loadReportFull(reportId);
    res.status(201).json({ report: { ...report, canEdit: true } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// PUT /api/reports/:id - update (owning supervisor or administrator only)
router.put('/:id', requireAuth, async (req, res) => {
  const [existingRows] = await pool.query('SELECT * FROM daily_reports WHERE id = ?', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Report not found.' });

  if (!canEdit(existing, req.user)) {
    return res.status(403).json({ error: 'You can only edit reports you personally submitted.' });
  }

  const { shiftId, status, busIssues, workOrders, significantActivity, incomingSupervisor, notes, callouts, shiftFills } = req.body || {};

  const incoming = {
    shift_id: shiftId ?? existing.shift_id,
    status: status ?? existing.status,
    bus_issues: busIssues ?? existing.bus_issues,
    work_orders: workOrders ?? existing.work_orders,
    significant_activity: significantActivity ?? existing.significant_activity,
    incoming_supervisor: incomingSupervisor ?? existing.incoming_supervisor,
    notes: notes ?? existing.notes,
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const field of ['shift_id', 'status', 'bus_issues', 'work_orders', 'significant_activity', 'incoming_supervisor', 'notes']) {
      const prev = existing[field];
      const next = incoming[field];
      if (String(prev ?? '') !== String(next ?? '')) {
        await recordHistory({
          reportId: req.params.id,
          userId: req.user.id,
          action: 'Field updated',
          fieldChanged: field,
          previousValue: prev !== null && prev !== undefined ? String(prev) : null,
          newValue: next !== null && next !== undefined ? String(next) : null,
        });
      }
    }

    await conn.query(
      `UPDATE daily_reports SET shift_id = ?, status = ?, bus_issues = ?, work_orders = ?, significant_activity = ?, incoming_supervisor = ?, notes = ?
       WHERE id = ?`,
      [incoming.shift_id, incoming.status === 'draft' ? 'draft' : (existing.status === 'draft' ? 'submitted' : 'edited'), incoming.bus_issues, incoming.work_orders, incoming.significant_activity, incoming.incoming_supervisor, incoming.notes, req.params.id]
    );

    if (Array.isArray(callouts)) {
      await conn.query('DELETE FROM driver_callouts WHERE report_id = ?', [req.params.id]);
      for (const c of callouts) {
        await conn.query(
          'INSERT INTO driver_callouts (report_id, shuttle_id, driver_id, notes) VALUES (?, ?, ?, ?)',
          [req.params.id, c.shuttleId || null, c.driverId || null, c.notes || null]
        );
      }
      await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Driver call-outs updated' });
    }

    if (Array.isArray(shiftFills)) {
      await conn.query('DELETE FROM driver_shift_fills WHERE report_id = ?', [req.params.id]);
      for (const f of shiftFills) {
        await conn.query(
          `INSERT INTO driver_shift_fills (report_id, shuttle_id, driver_id, coverage_type, original_shuttle_id, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.params.id, f.shuttleId || null, f.driverId || null, f.coverageType === 'moved' ? 'moved' : 'assigned', f.coverageType === 'moved' ? (f.originalShuttleId || null) : null, f.notes || null]
        );
      }
      await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Driver shift fills updated' });
    }

    await conn.commit();
    await recordAudit({ userId: req.user.id, action: 'report_updated', entity: 'daily_report', entityId: req.params.id, ipAddress: req.ip });

    const report = await loadReportFull(req.params.id);
    res.json({ report: { ...report, canEdit: true } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/reports/:id/comments - manager/administrator
router.post('/:id/comments', requireAuth, requireMinRole('manager'), async (req, res) => {
  const { comment } = req.body || {};
  if (!comment || !comment.trim()) return res.status(400).json({ error: 'Comment text is required.' });

  const [existing] = await pool.query('SELECT id FROM daily_reports WHERE id = ?', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Report not found.' });

  const [result] = await pool.query(
    'INSERT INTO report_comments (report_id, user_id, comment) VALUES (?, ?, ?)',
    [req.params.id, req.user.id, comment.trim()]
  );
  await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Comment added' });
  await recordAudit({ userId: req.user.id, action: 'manager_comment', entity: 'daily_report', entityId: req.params.id, ipAddress: req.ip });

  res.status(201).json({ id: result.insertId });
});

// GET /api/reports/:id/history
router.get('/:id/history', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT h.id, h.action, h.field_changed, h.previous_value, h.new_value, h.created_at, u.name AS user_name
     FROM report_history h JOIN users u ON u.id = h.user_id
     WHERE h.report_id = ? ORDER BY h.created_at`,
    [req.params.id]
  );
  res.json({ history: rows });
});

module.exports = router;
