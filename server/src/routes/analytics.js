const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');

const router = express.Router();

// Analytics/Trends are a Manager+ capability - not available to Supervisors.
router.use(requireAuth, requireMinRole('manager'));

function parseIdList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

/**
 * Builds the shared WHERE clause + params applied to every analytics query:
 * date range, shift(s), supervisor(s), and excludes drafts (analytics only
 * reflect finalized/submitted operational data).
 */
function baseFilters(query) {
  const where = ["dr.status != 'draft'"];
  const params = [];

  if (query.dateFrom) { where.push('dr.report_date >= ?'); params.push(query.dateFrom); }
  if (query.dateTo) { where.push('dr.report_date <= ?'); params.push(query.dateTo); }

  const shiftIds = parseIdList(query.shiftIds);
  if (shiftIds.length) { where.push(`dr.shift_id IN (${shiftIds.map(() => '?').join(',')})`); params.push(...shiftIds); }

  const supervisorIds = parseIdList(query.supervisorIds);
  if (supervisorIds.length) { where.push(`dr.supervisor_id IN (${supervisorIds.map(() => '?').join(',')})`); params.push(...supervisorIds); }

  return { where: where.join(' AND '), params };
}

async function count(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows[0].n;
}

async function rows(sql, params) {
  const [r] = await pool.query(sql, params);
  return r;
}

// GET /api/analytics - one comprehensive, filter-driven payload so every
// chart on the dashboard updates together from a single request.
router.get('/', async (req, res) => {
  const { where, params } = baseFilters(req.query);
  const driverId = req.query.driverId ? Number(req.query.driverId) : null;
  const shuttleId = req.query.shuttleId ? Number(req.query.shuttleId) : null;

  const calloutDriverClause = driverId ? ' AND c.driver_id = ?' : '';
  const calloutShuttleClause = shuttleId ? ' AND c.shuttle_id = ?' : '';
  const coverageDriverClause = driverId ? ' AND sc.driver_id = ?' : '';
  const coverageShuttleClause = shuttleId ? ' AND (sc.shuttle_id = ? OR sc.original_shuttle_id = ?)' : '';

  const calloutParams = [...params, ...(driverId ? [driverId] : []), ...(shuttleId ? [shuttleId] : [])];
  const coverageParams = (extra = []) => [...params, ...extra, ...(driverId ? [driverId] : []), ...(shuttleId ? [shuttleId, shuttleId] : [])];

  const [
    totalReports,
    totalCallouts,
    totalOt,
    totalMoved,
    totalUncovered,
    totalWorkOrders,

    calloutTrend,
    otTrend,
    movedTrend,
    uncoveredTrend,
    workOrderTrend,

    calloutsBySupervisor,
    otBySupervisor,
    movedBySupervisor,
    uncoveredBySupervisor,
    workOrdersBySupervisor,

    calloutsByShift,
    otByShift,
    movedByShift,
    uncoveredByShift,
    workOrdersByShift,

    calloutsByShuttle,
    otByShuttle,
    movedByShuttle,
    uncoveredByShuttle,

    calloutsByDriver,
    mostMovedDrivers,

    workOrdersByLocation,

    incomingSupervisorTotals,
    incomingSupervisorTrend,

    driverMovementDetails,
    busIssueDetails,
  ] = await Promise.all([
    count(`SELECT COUNT(*) n FROM daily_reports dr WHERE ${where}`, params),
    count(`SELECT COUNT(*) n FROM driver_callouts c JOIN daily_reports dr ON dr.id = c.report_id WHERE ${where}${calloutDriverClause}${calloutShuttleClause}`, calloutParams),
    count(`SELECT COUNT(*) n FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id WHERE ${where} AND sc.coverage_type = 'ot'${coverageDriverClause}${shuttleId ? ' AND sc.shuttle_id = ?' : ''}`, [...params, ...(driverId ? [driverId] : []), ...(shuttleId ? [shuttleId] : [])]),
    count(`SELECT COUNT(*) n FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id WHERE ${where} AND sc.coverage_type = 'moved'${coverageDriverClause}${coverageShuttleClause}`, coverageParams()),
    count(`SELECT COUNT(*) n FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id WHERE ${where} AND sc.coverage_type = 'not_covered'${shuttleId ? ' AND sc.shuttle_id = ?' : ''}`, [...params, ...(shuttleId ? [shuttleId] : [])]),
    count(`SELECT COUNT(*) n FROM work_orders wo JOIN daily_reports dr ON dr.id = wo.report_id WHERE ${where}`, params),

    rows(`SELECT dr.report_date AS date, COUNT(*) AS count FROM driver_callouts c JOIN daily_reports dr ON dr.id = c.report_id WHERE ${where}${calloutDriverClause}${calloutShuttleClause} GROUP BY dr.report_date ORDER BY dr.report_date`, calloutParams),
    rows(`SELECT dr.report_date AS date, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id WHERE ${where} AND sc.coverage_type = 'ot'${coverageDriverClause}${shuttleId ? ' AND sc.shuttle_id = ?' : ''} GROUP BY dr.report_date ORDER BY dr.report_date`, [...params, ...(driverId ? [driverId] : []), ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT dr.report_date AS date, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id WHERE ${where} AND sc.coverage_type = 'moved'${coverageDriverClause}${coverageShuttleClause} GROUP BY dr.report_date ORDER BY dr.report_date`, coverageParams()),
    rows(`SELECT dr.report_date AS date, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id WHERE ${where} AND sc.coverage_type = 'not_covered'${shuttleId ? ' AND sc.shuttle_id = ?' : ''} GROUP BY dr.report_date ORDER BY dr.report_date`, [...params, ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT dr.report_date AS date, COUNT(*) AS count FROM work_orders wo JOIN daily_reports dr ON dr.id = wo.report_id WHERE ${where} GROUP BY dr.report_date ORDER BY dr.report_date`, params),

    rows(`SELECT u.id, u.name AS label, COUNT(*) AS count FROM driver_callouts c JOIN daily_reports dr ON dr.id = c.report_id JOIN users u ON u.id = dr.supervisor_id WHERE ${where}${calloutDriverClause}${calloutShuttleClause} GROUP BY u.id, u.name ORDER BY count DESC`, calloutParams),
    rows(`SELECT u.id, u.name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN users u ON u.id = dr.supervisor_id WHERE ${where} AND sc.coverage_type = 'ot'${coverageDriverClause}${shuttleId ? ' AND sc.shuttle_id = ?' : ''} GROUP BY u.id, u.name ORDER BY count DESC`, [...params, ...(driverId ? [driverId] : []), ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT u.id, u.name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN users u ON u.id = dr.supervisor_id WHERE ${where} AND sc.coverage_type = 'moved'${coverageDriverClause}${coverageShuttleClause} GROUP BY u.id, u.name ORDER BY count DESC`, coverageParams()),
    rows(`SELECT u.id, u.name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN users u ON u.id = dr.supervisor_id WHERE ${where} AND sc.coverage_type = 'not_covered'${shuttleId ? ' AND sc.shuttle_id = ?' : ''} GROUP BY u.id, u.name ORDER BY count DESC`, [...params, ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT u.id, u.name AS label, COUNT(*) AS count FROM work_orders wo JOIN daily_reports dr ON dr.id = wo.report_id JOIN users u ON u.id = dr.supervisor_id WHERE ${where} GROUP BY u.id, u.name ORDER BY count DESC`, params),

    rows(`SELECT s.id, s.name AS label, COUNT(*) AS count FROM driver_callouts c JOIN daily_reports dr ON dr.id = c.report_id JOIN shifts s ON s.id = dr.shift_id WHERE ${where}${calloutDriverClause}${calloutShuttleClause} GROUP BY s.id, s.name ORDER BY s.id`, calloutParams),
    rows(`SELECT s.id, s.name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN shifts s ON s.id = dr.shift_id WHERE ${where} AND sc.coverage_type = 'ot'${coverageDriverClause}${shuttleId ? ' AND sc.shuttle_id = ?' : ''} GROUP BY s.id, s.name ORDER BY s.id`, [...params, ...(driverId ? [driverId] : []), ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT s.id, s.name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN shifts s ON s.id = dr.shift_id WHERE ${where} AND sc.coverage_type = 'moved'${coverageDriverClause}${coverageShuttleClause} GROUP BY s.id, s.name ORDER BY s.id`, coverageParams()),
    rows(`SELECT s.id, s.name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN shifts s ON s.id = dr.shift_id WHERE ${where} AND sc.coverage_type = 'not_covered'${shuttleId ? ' AND sc.shuttle_id = ?' : ''} GROUP BY s.id, s.name ORDER BY s.id`, [...params, ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT s.id, s.name AS label, COUNT(*) AS count FROM work_orders wo JOIN daily_reports dr ON dr.id = wo.report_id JOIN shifts s ON s.id = dr.shift_id WHERE ${where} GROUP BY s.id, s.name ORDER BY s.id`, params),

    rows(`SELECT sh.id, sh.shuttle_number AS label, COUNT(*) AS count FROM driver_callouts c JOIN daily_reports dr ON dr.id = c.report_id JOIN shuttles sh ON sh.id = c.shuttle_id WHERE ${where}${calloutDriverClause}${calloutShuttleClause} GROUP BY sh.id, sh.shuttle_number ORDER BY count DESC LIMIT 20`, calloutParams),
    rows(`SELECT sh.id, sh.shuttle_number AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN shuttles sh ON sh.id = sc.shuttle_id WHERE ${where} AND sc.coverage_type = 'ot'${coverageDriverClause} GROUP BY sh.id, sh.shuttle_number ORDER BY count DESC LIMIT 20`, [...params, ...(driverId ? [driverId] : [])]),
    rows(`SELECT sh.id, sh.shuttle_number AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN shuttles sh ON sh.id = sc.shuttle_id WHERE ${where} AND sc.coverage_type = 'moved'${coverageDriverClause} GROUP BY sh.id, sh.shuttle_number ORDER BY count DESC LIMIT 20`, [...params, ...(driverId ? [driverId] : [])]),
    rows(`SELECT sh.id, sh.shuttle_number AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN shuttles sh ON sh.id = sc.shuttle_id WHERE ${where} AND sc.coverage_type = 'not_covered' GROUP BY sh.id, sh.shuttle_number ORDER BY count DESC LIMIT 20`, params),

    rows(`SELECT dv.id, dv.driver_name AS label, COUNT(*) AS count FROM driver_callouts c JOIN daily_reports dr ON dr.id = c.report_id JOIN drivers dv ON dv.id = c.driver_id WHERE ${where}${calloutShuttleClause} GROUP BY dv.id, dv.driver_name ORDER BY count DESC LIMIT 20`, [...params, ...(shuttleId ? [shuttleId] : [])]),
    rows(`SELECT dv.id, dv.driver_name AS label, COUNT(*) AS count FROM shift_coverage sc JOIN daily_reports dr ON dr.id = sc.report_id JOIN drivers dv ON dv.id = sc.driver_id WHERE ${where} AND sc.coverage_type = 'moved'${shuttleId ? ' AND (sc.shuttle_id = ? OR sc.original_shuttle_id = ?)' : ''} GROUP BY dv.id, dv.driver_name ORDER BY count DESC LIMIT 20`, [...params, ...(shuttleId ? [shuttleId, shuttleId] : [])]),

    rows(`SELECT wo.location AS label, COUNT(*) AS count FROM work_orders wo JOIN daily_reports dr ON dr.id = wo.report_id WHERE ${where} GROUP BY wo.location ORDER BY count DESC`, params),

    rows(`SELECT u.id, u.name AS label, COUNT(*) AS count FROM report_incoming_supervisors ris JOIN daily_reports dr ON dr.id = ris.report_id JOIN users u ON u.id = ris.user_id WHERE ${where} GROUP BY u.id, u.name ORDER BY count DESC`, params),
    rows(`SELECT dr.report_date AS date, COUNT(*) AS count FROM report_incoming_supervisors ris JOIN daily_reports dr ON dr.id = ris.report_id WHERE ${where} GROUP BY dr.report_date ORDER BY dr.report_date`, params),

    rows(
      `SELECT dr.id AS report_id, dr.report_date, s.name AS shift_name, u.name AS supervisor_name,
              dv.driver_name, osh.shuttle_number AS original_shuttle_number, sh.shuttle_number, sc.notes
       FROM shift_coverage sc
       JOIN daily_reports dr ON dr.id = sc.report_id
       JOIN shifts s ON s.id = dr.shift_id
       JOIN users u ON u.id = dr.supervisor_id
       LEFT JOIN drivers dv ON dv.id = sc.driver_id
       LEFT JOIN shuttles sh ON sh.id = sc.shuttle_id
       LEFT JOIN shuttles osh ON osh.id = sc.original_shuttle_id
       WHERE ${where} AND sc.coverage_type = 'moved'${coverageDriverClause}${coverageShuttleClause}
       ORDER BY dr.report_date DESC LIMIT 100`,
      coverageParams()
    ),
    rows(
      `SELECT dr.id AS report_id, dr.report_date, s.name AS shift_name, u.name AS supervisor_name,
              sh.shuttle_number, sc.notes
       FROM shift_coverage sc
       JOIN daily_reports dr ON dr.id = sc.report_id
       JOIN shifts s ON s.id = dr.shift_id
       JOIN users u ON u.id = dr.supervisor_id
       LEFT JOIN shuttles sh ON sh.id = sc.shuttle_id
       WHERE ${where} AND sc.coverage_type = 'not_covered'${shuttleId ? ' AND sc.shuttle_id = ?' : ''}
       ORDER BY dr.report_date DESC LIMIT 100`,
      [...params, ...(shuttleId ? [shuttleId] : [])]
    ),
  ]);

  res.json({
    totals: {
      reports: totalReports,
      callouts: totalCallouts,
      otCoverage: totalOt,
      driverMovements: totalMoved,
      uncoveredShifts: totalUncovered,
      workOrders: totalWorkOrders,
    },
    trend: {
      callouts: calloutTrend,
      ot: otTrend,
      moved: movedTrend,
      uncovered: uncoveredTrend,
      workOrders: workOrderTrend,
      incomingSupervisors: incomingSupervisorTrend,
    },
    bySupervisor: {
      callouts: calloutsBySupervisor,
      ot: otBySupervisor,
      moved: movedBySupervisor,
      uncovered: uncoveredBySupervisor,
      workOrders: workOrdersBySupervisor,
    },
    byShift: {
      callouts: calloutsByShift,
      ot: otByShift,
      moved: movedByShift,
      uncovered: uncoveredByShift,
      workOrders: workOrdersByShift,
    },
    byShuttle: {
      callouts: calloutsByShuttle,
      ot: otByShuttle,
      moved: movedByShuttle,
      uncovered: uncoveredByShuttle,
    },
    byDriver: {
      callouts: calloutsByDriver,
      mostMoved: mostMovedDrivers,
    },
    byLocation: {
      workOrders: workOrdersByLocation,
    },
    incomingSupervisors: incomingSupervisorTotals,
    driverMovementDetails,
    busIssueDetails,
  });
});

// GET /api/analytics/export.csv - one row per matching report, with a count
// of each metric, respecting the same filters as the dashboard.
router.get('/export.csv', async (req, res) => {
  const { where, params } = baseFilters(req.query);

  const reportRows = await rows(
    `SELECT dr.id, dr.report_date, s.name AS shift_name, u.name AS supervisor_name, dr.status,
            (SELECT COUNT(*) FROM driver_callouts c WHERE c.report_id = dr.id) AS callouts,
            (SELECT COUNT(*) FROM shift_coverage sc WHERE sc.report_id = dr.id AND sc.coverage_type = 'ot') AS ot_coverage,
            (SELECT COUNT(*) FROM shift_coverage sc WHERE sc.report_id = dr.id AND sc.coverage_type = 'moved') AS driver_movements,
            (SELECT COUNT(*) FROM shift_coverage sc WHERE sc.report_id = dr.id AND sc.coverage_type = 'not_covered') AS uncovered_shifts,
            (SELECT COUNT(*) FROM work_orders wo WHERE wo.report_id = dr.id) AS work_orders
     FROM daily_reports dr
     JOIN shifts s ON s.id = dr.shift_id
     JOIN users u ON u.id = dr.supervisor_id
     WHERE ${where}
     ORDER BY dr.report_date DESC`,
    params
  );

  const header = ['Report ID', 'Date', 'Shift', 'Supervisor', 'Status', 'Call-Outs', 'OT Coverage', 'Driver Movements', 'Uncovered Shifts', 'Work Orders'];
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const r of reportRows) {
    lines.push([r.id, r.report_date, r.shift_name, r.supervisor_name, r.status, r.callouts, r.ot_coverage, r.driver_movements, r.uncovered_shifts, r.work_orders].map(csvEscape).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="daily-report-analytics-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
