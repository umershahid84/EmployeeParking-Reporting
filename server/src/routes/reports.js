const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { recordHistory } = require('../utils/history');
const { sendReportSubmittedEmail } = require('../utils/email');

const router = express.Router();

const COVERAGE_TYPES = ['ot', 'moved', 'not_covered'];
const WORK_ORDER_LOCATIONS = ['LOT - A', 'LOT - C', 'North Employee Parking Lot'];

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

  const [incomingSupervisors] = await pool.query(
    `SELECT ris.id, u.id AS user_id, u.name AS user_name
     FROM report_incoming_supervisors ris
     JOIN users u ON u.id = ris.user_id
     WHERE ris.report_id = ? ORDER BY u.name`,
    [reportId]
  );

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

  const [shiftCoverage] = await pool.query(
    `SELECT sc.id, sc.coverage_type, sc.notes, sc.created_at,
            sh.id AS shuttle_id, sh.shuttle_number,
            dv.id AS driver_id, dv.driver_name,
            osh.id AS original_shuttle_id, osh.shuttle_number AS original_shuttle_number
     FROM shift_coverage sc
     LEFT JOIN shuttles sh ON sh.id = sc.shuttle_id
     LEFT JOIN drivers dv ON dv.id = sc.driver_id
     LEFT JOIN shuttles osh ON osh.id = sc.original_shuttle_id
     WHERE sc.report_id = ? ORDER BY sc.id`,
    [reportId]
  );

  const [workOrders] = await pool.query(
    `SELECT wo.id, wo.location, wo.comments, wo.created_at, u.id AS user_id, u.name AS user_name
     FROM work_orders wo
     JOIN users u ON u.id = wo.user_id
     WHERE wo.report_id = ? ORDER BY wo.id`,
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

  return { ...report, incomingSupervisors, callouts, shiftCoverage, workOrders, comments, history };
}

function canEdit(report, user) {
  if (user.role === 'administrator') return true;
  if (user.role === 'supervisor') return report.supervisor_id === user.id;
  return false; // managers can view/comment but not edit report content
}

function validateShiftCoverage(entries) {
  for (const e of entries) {
    if (!COVERAGE_TYPES.includes(e.coverageType)) {
      return `Invalid shift coverage type: ${e.coverageType}`;
    }
    if (!e.shuttleId) {
      return 'Shift coverage entries require a shuttle/bus number.';
    }
    if ((e.coverageType === 'ot' || e.coverageType === 'moved') && !e.driverId) {
      return 'Shift coverage entries covered with OT or moved from another shuttle require a driver.';
    }
    if (e.coverageType === 'moved' && !e.originalShuttleId) {
      return 'Shift coverage entries moved from another shuttle require the original shuttle.';
    }
  }
  return null;
}

function validateWorkOrders(entries) {
  for (const e of entries) {
    if (!WORK_ORDER_LOCATIONS.includes(e.location)) {
      return `Invalid work order location: ${e.location}`;
    }
  }
  return null;
}

async function insertShiftCoverage(conn, reportId, entries) {
  for (const e of entries) {
    const isMoved = e.coverageType === 'moved';
    const isNotCovered = e.coverageType === 'not_covered';
    await conn.query(
      `INSERT INTO shift_coverage (report_id, coverage_type, shuttle_id, driver_id, original_shuttle_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        reportId,
        e.coverageType,
        e.shuttleId || null,
        isNotCovered ? null : (e.driverId || null),
        isMoved ? (e.originalShuttleId || null) : null,
        e.notes || null,
      ]
    );
  }
}

async function insertWorkOrders(conn, reportId, entries, userId) {
  for (const e of entries) {
    await conn.query(
      `INSERT INTO work_orders (report_id, location, comments, user_id) VALUES (?, ?, ?, ?)`,
      [reportId, e.location, e.comments || null, userId]
    );
  }
}

async function insertIncomingSupervisors(conn, reportId, userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  for (const userId of uniqueIds) {
    await conn.query(
      'INSERT INTO report_incoming_supervisors (report_id, user_id) VALUES (?, ?)',
      [reportId, userId]
    );
  }
}

/**
 * Emails every active daily-report recipient (managed in the Admin Portal)
 * that a report was submitted. Never throws - sendReportSubmittedEmail logs
 * failures per-recipient instead of blocking the submission response.
 */
async function notifyReportSubmitted(reportId, actorUserId, ip) {
  const report = await loadReportFull(reportId);
  if (!report) return;

  const [recipientRows] = await pool.query(
    `SELECT email FROM email_recipients WHERE notification_type = 'daily_report' AND is_active = 1`
  );
  if (!recipientRows.length) return;

  const reportForEmail = { ...report, incomingSupervisorNames: report.incomingSupervisors.map((s) => s.user_name) };

  for (const { email } of recipientRows) {
    await sendReportSubmittedEmail({ toEmail: email, report: reportForEmail });
  }

  await recordAudit({
    userId: actorUserId,
    action: 'report_submission_email_sent',
    entity: 'daily_report',
    entityId: reportId,
    details: { recipients: recipientRows.map((r) => r.email) },
    ipAddress: ip,
  });
}

// GET /api/reports - list with filters
router.get('/', requireAuth, async (req, res) => {
  const { date, dateFrom, dateTo, shiftId, supervisorId, driverId, shuttleId, status, hasCallouts, hasShiftCoverage } = req.query;
  const where = [];
  const params = [];

  if (date) { where.push('dr.report_date = ?'); params.push(date); }
  if (dateFrom) { where.push('dr.report_date >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('dr.report_date <= ?'); params.push(dateTo); }
  if (shiftId) { where.push('dr.shift_id = ?'); params.push(shiftId); }
  if (supervisorId) { where.push('dr.supervisor_id = ?'); params.push(supervisorId); }
  if (status) { where.push('dr.status = ?'); params.push(status); }
  if (driverId) {
    where.push('(EXISTS (SELECT 1 FROM driver_callouts c WHERE c.report_id = dr.id AND c.driver_id = ?) OR EXISTS (SELECT 1 FROM shift_coverage sc WHERE sc.report_id = dr.id AND sc.driver_id = ?))');
    params.push(driverId, driverId);
  }
  if (shuttleId) {
    where.push('(EXISTS (SELECT 1 FROM driver_callouts c WHERE c.report_id = dr.id AND c.shuttle_id = ?) OR EXISTS (SELECT 1 FROM shift_coverage sc WHERE sc.report_id = dr.id AND (sc.shuttle_id = ? OR sc.original_shuttle_id = ?)))');
    params.push(shuttleId, shuttleId, shuttleId);
  }
  if (hasCallouts === '1') { where.push('EXISTS (SELECT 1 FROM driver_callouts c WHERE c.report_id = dr.id)'); }
  if (hasShiftCoverage === '1') { where.push('EXISTS (SELECT 1 FROM shift_coverage sc WHERE sc.report_id = dr.id)'); }

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

// POST /api/reports - create. Daily Reports are an operational Supervisor
// function: Managers and Administrators are blocked here, not just hidden
// in the UI, so the restriction can't be bypassed via direct API access.
router.post('/', requireAuth, requireRole('supervisor'), async (req, res) => {
  const {
    reportDate, shiftId, status, busIssues, significantActivity, notes,
    incomingSupervisorIds, callouts, shiftCoverage, workOrders,
  } = req.body || {};
  if (!reportDate || !shiftId) {
    return res.status(400).json({ error: 'Report date and shift are required.' });
  }

  const coverageError = validateShiftCoverage(shiftCoverage || []);
  if (coverageError) return res.status(400).json({ error: coverageError });
  const workOrderError = validateWorkOrders(workOrders || []);
  if (workOrderError) return res.status(400).json({ error: workOrderError });

  const resultStatus = status === 'draft' ? 'draft' : 'submitted';

  const conn = await pool.getConnection();
  let reportId;
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO daily_reports (report_date, shift_id, supervisor_id, status, bus_issues, significant_activity, notes, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportDate, shiftId, req.user.id, resultStatus, busIssues || null, significantActivity || null, notes || null, resultStatus === 'submitted' ? new Date() : null]
    );
    reportId = result.insertId;

    await insertIncomingSupervisors(conn, reportId, incomingSupervisorIds);
    for (const c of callouts || []) {
      await conn.query(
        'INSERT INTO driver_callouts (report_id, shuttle_id, driver_id, notes) VALUES (?, ?, ?, ?)',
        [reportId, c.shuttleId || null, c.driverId || null, c.notes || null]
      );
    }
    await insertShiftCoverage(conn, reportId, shiftCoverage || []);
    await insertWorkOrders(conn, reportId, workOrders || [], req.user.id);

    await conn.commit();

    await recordHistory({ reportId, userId: req.user.id, action: 'Report created' });
    await recordAudit({ userId: req.user.id, action: 'report_created', entity: 'daily_report', entityId: reportId, details: { status: resultStatus }, ipAddress: req.ip });

    if (resultStatus === 'submitted') {
      await notifyReportSubmitted(reportId, req.user.id, req.ip);
    }

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

  const {
    shiftId, status, busIssues, significantActivity, notes,
    incomingSupervisorIds, callouts, shiftCoverage, workOrders,
  } = req.body || {};

  if (Array.isArray(shiftCoverage)) {
    const coverageError = validateShiftCoverage(shiftCoverage);
    if (coverageError) return res.status(400).json({ error: coverageError });
  }
  if (Array.isArray(workOrders)) {
    const workOrderError = validateWorkOrders(workOrders);
    if (workOrderError) return res.status(400).json({ error: workOrderError });
  }

  const incoming = {
    shift_id: shiftId ?? existing.shift_id,
    bus_issues: busIssues ?? existing.bus_issues,
    significant_activity: significantActivity ?? existing.significant_activity,
    notes: notes ?? existing.notes,
  };
  const desiredStatus = status === 'draft' ? 'draft' : (status ? 'submitted' : existing.status);
  const resultStatus = desiredStatus === 'draft' ? 'draft' : (existing.status === 'draft' ? 'submitted' : 'edited');
  const isNewlySubmitted = existing.status === 'draft' && resultStatus === 'submitted';

  // Administrators can correct an already-submitted report, but submitting a
  // Daily Report for the first time is a Supervisor-only action - enforced
  // here, not just by hiding the button, so it can't be bypassed via the API.
  if (isNewlySubmitted && req.user.role === 'administrator') {
    return res.status(403).json({ error: 'Administrators cannot submit Daily Reports.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const field of ['shift_id', 'bus_issues', 'significant_activity', 'notes']) {
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
    if (existing.status !== resultStatus) {
      await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Field updated', fieldChanged: 'status', previousValue: existing.status, newValue: resultStatus });
    }

    await conn.query(
      `UPDATE daily_reports SET shift_id = ?, status = ?, bus_issues = ?, significant_activity = ?, notes = ?, submitted_at = COALESCE(submitted_at, ?)
       WHERE id = ?`,
      [incoming.shift_id, resultStatus, incoming.bus_issues, incoming.significant_activity, incoming.notes, isNewlySubmitted ? new Date() : null, req.params.id]
    );

    if (Array.isArray(incomingSupervisorIds)) {
      await conn.query('DELETE FROM report_incoming_supervisors WHERE report_id = ?', [req.params.id]);
      await insertIncomingSupervisors(conn, req.params.id, incomingSupervisorIds);
      await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Incoming supervisors updated' });
    }

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

    if (Array.isArray(shiftCoverage)) {
      await conn.query('DELETE FROM shift_coverage WHERE report_id = ?', [req.params.id]);
      await insertShiftCoverage(conn, req.params.id, shiftCoverage);
      await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Shift coverage updated' });
    }

    if (Array.isArray(workOrders)) {
      await conn.query('DELETE FROM work_orders WHERE report_id = ?', [req.params.id]);
      await insertWorkOrders(conn, req.params.id, workOrders, req.user.id);
      await recordHistory({ reportId: req.params.id, userId: req.user.id, action: 'Work orders updated' });
    }

    await conn.commit();
    await recordAudit({ userId: req.user.id, action: 'report_updated', entity: 'daily_report', entityId: req.params.id, ipAddress: req.ip });

    if (isNewlySubmitted) {
      await notifyReportSubmitted(req.params.id, req.user.id, req.ip);
    }

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
