const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db/pool');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { INK_PRIMARY, INK_SECONDARY, INK_MUTED, LINE } = require('../utils/pdfTable');
const { LOGO_PATH, logoExists } = require('../utils/logo');
const {
  METRIC_COLORS,
  LOCATION_COLORS,
  drawStatTiles,
  drawLineChart,
  drawGroupedBarChart,
  drawHorizontalBarChart,
  drawPieChart,
} = require('../utils/pdfCharts');

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
async function computeAnalytics(query) {
  const { where, params } = baseFilters(query);
  const driverId = query.driverId ? Number(query.driverId) : null;
  const shuttleId = query.shuttleId ? Number(query.shuttleId) : null;

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

  return {
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
  };
}

// GET /api/analytics - one comprehensive, filter-driven payload so every
// chart on the dashboard updates together from a single request.
router.get('/', async (req, res) => {
  const analytics = await computeAnalytics(req.query);
  res.json(analytics);
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

  const header = ['Date', 'Shift', 'Supervisor', 'Status', 'Call-Outs', 'OT Coverage', 'Driver Movements', 'Uncovered Shifts', 'Work Orders'];
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const r of reportRows) {
    lines.push([r.report_date, r.shift_name, r.supervisor_name, r.status, r.callouts, r.ot_coverage, r.driver_movements, r.uncovered_shifts, r.work_orders].map(csvEscape).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="daily-report-analytics-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

function describeAnalyticsFilters(query) {
  const parts = [];
  if (query.dateFrom || query.dateTo) parts.push(`Date: ${query.dateFrom || '…'} to ${query.dateTo || '…'}`);
  if (query.shiftIds) parts.push('Shift filter applied');
  if (query.supervisorIds) parts.push('Supervisor filter applied');
  if (query.driverId) parts.push('Driver filter applied');
  if (query.shuttleId) parts.push('Shuttle filter applied');
  return parts.length ? parts.join(' · ') : 'All data';
}

// Combines several {label, count} series into one row per fixed label, so
// a grouped bar chart can plot every metric against the same category axis
// (mirrors the client's mergeByFixedLabels in Analytics.jsx).
function mergeByFixedLabels(labels, metricSeries) {
  return labels.map((label) => {
    const row = { label };
    for (const [metricKey, arr] of Object.entries(metricSeries)) {
      const match = arr.find((item) => item.label === label);
      row[metricKey] = match ? Number(match.count) : 0;
    }
    return row;
  });
}

// Same, but for an open-ended category axis (e.g. supervisors) - takes the
// union of every label across the series, sorted by total descending
// (mirrors the client's mergeByUnion in Analytics.jsx).
function mergeByUnion(metricSeries, limit = 8) {
  const map = new Map();
  for (const [metricKey, arr] of Object.entries(metricSeries)) {
    for (const item of arr) {
      if (!map.has(item.label)) map.set(item.label, { label: item.label });
      map.get(item.label)[metricKey] = Number(item.count);
    }
  }
  const rows = Array.from(map.values()).map((row) => {
    for (const metricKey of Object.keys(metricSeries)) {
      if (row[metricKey] === undefined) row[metricKey] = 0;
    }
    return row;
  });
  rows.sort((a, b) => {
    const totalA = Object.keys(metricSeries).reduce((sum, k) => sum + a[k], 0);
    const totalB = Object.keys(metricSeries).reduce((sum, k) => sum + b[k], 0);
    return totalB - totalA;
  });
  return rows.slice(0, limit);
}

const COMPARISON_SERIES_DEF = [
  { key: 'callouts', label: 'Call-Outs', color: METRIC_COLORS.callouts },
  { key: 'ot', label: 'Shift Covered with OT', color: METRIC_COLORS.ot },
  { key: 'moved', label: 'Moved from Another Shuttle', color: METRIC_COLORS.moved },
  { key: 'uncovered', label: 'Shift Not Covered (Bus Issue)', color: METRIC_COLORS.uncovered },
  { key: 'workOrders', label: 'Work Orders', color: METRIC_COLORS.workOrders },
];

function toGroupedSeries(mergedRows) {
  return {
    categories: mergedRows.map((r) => r.label),
    series: COMPARISON_SERIES_DEF.map((def) => ({
      label: def.label,
      color: def.color,
      values: mergedRows.map((r) => r[def.key] || 0),
    })),
  };
}

// GET /api/analytics/export.pdf - a printable, charted summary of the same
// filter-driven analytics payload the dashboard renders, so exported PDFs
// carry the same colored trend/comparison/breakdown charts shown on screen.
router.get('/export.pdf', async (req, res) => {
  const analytics = await computeAnalytics(req.query);
  const [shiftRows] = await pool.query('SELECT name FROM shifts ORDER BY id');
  const shiftNames = shiftRows.map((r) => r.name);

  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="analytics-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const contentWidth = right - left;

  function ensureSpace(height) {
    if (doc.y + height > bottom) doc.addPage();
  }

  function heading(text) {
    ensureSpace(30);
    doc.x = left;
    doc.y += 10;
    doc.fontSize(13).fillColor(INK_PRIMARY).text(text, left, doc.y, { width: contentWidth });
    doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor(LINE).stroke();
    doc.y += 6;
    doc.x = left;
  }

  if (logoExists()) {
    const logoTop = doc.y;
    doc.image(LOGO_PATH, left, logoTop, { height: 34 });
    doc.y = logoTop + 34 + 10;
  }

  doc.fontSize(16).fillColor(INK_PRIMARY).text('Employee Parking Analytics & Trends', left, doc.y, { width: contentWidth });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor(INK_SECONDARY).text(describeAnalyticsFilters(req.query), left, doc.y, { width: contentWidth });
  doc.fontSize(8).fillColor(INK_MUTED).text(`Generated ${new Date().toLocaleString()}`, left, doc.y, { width: contentWidth });

  // --- Overview: colored KPI tiles -----------------------------------
  heading('Overview');
  const totals = analytics.totals;
  const tiles = [
    { label: 'Total Reports', value: totals.reports, color: METRIC_COLORS.reports },
    { label: 'Driver Call-Outs', value: totals.callouts, color: METRIC_COLORS.callouts },
    { label: 'OT Coverage', value: totals.otCoverage, color: METRIC_COLORS.ot },
    { label: 'Driver Movements', value: totals.driverMovements, color: METRIC_COLORS.moved },
    { label: 'Uncovered Shifts', value: totals.uncoveredShifts, color: METRIC_COLORS.uncovered },
    { label: 'Work Orders', value: totals.workOrders, color: METRIC_COLORS.workOrders },
  ];
  ensureSpace(56 * 2 + 10);
  doc.y = drawStatTiles(doc, { x: left, y: doc.y, width: contentWidth, tiles, columns: 3, tileHeight: 56 });

  // --- Trends: one colored line chart per metric ----------------------
  heading('Trends');
  const trendCharts = [
    { title: 'Driver Call-Out Trend', data: analytics.trend.callouts, color: METRIC_COLORS.callouts },
    { title: 'OT Coverage Trend', data: analytics.trend.ot, color: METRIC_COLORS.ot },
    { title: 'Driver Movement Trend', data: analytics.trend.moved, color: METRIC_COLORS.moved },
    { title: 'Bus Issue Trend', data: analytics.trend.uncovered, color: METRIC_COLORS.uncovered },
    { title: 'Work Order Trend', data: analytics.trend.workOrders, color: METRIC_COLORS.workOrders },
    { title: 'Incoming Supervisor Handoffs', data: analytics.trend.incomingSupervisors, color: METRIC_COLORS.incomingSupervisors },
  ];
  const trendChartWidth = (contentWidth - 16) / 2;
  const trendChartHeight = 95;
  for (let i = 0; i < trendCharts.length; i += 2) {
    ensureSpace(trendChartHeight + 14);
    const rowY = doc.y;
    drawLineChart(doc, { x: left, y: rowY, width: trendChartWidth, height: trendChartHeight, ...trendCharts[i] });
    if (trendCharts[i + 1]) {
      drawLineChart(doc, { x: left + trendChartWidth + 16, y: rowY, width: trendChartWidth, height: trendChartHeight, ...trendCharts[i + 1] });
    }
    doc.y = rowY + trendChartHeight + 14;
  }

  // --- Comparisons: colored grouped bar charts ------------------------
  heading('Comparisons — By Shift');
  const byShiftMerged = mergeByFixedLabels(shiftNames, {
    callouts: analytics.byShift.callouts,
    ot: analytics.byShift.ot,
    moved: analytics.byShift.moved,
    uncovered: analytics.byShift.uncovered,
    workOrders: analytics.byShift.workOrders,
  });
  const byShiftChart = toGroupedSeries(byShiftMerged);
  ensureSpace(160);
  doc.y = drawGroupedBarChart(doc, { x: left, y: doc.y, width: contentWidth, height: 150, ...byShiftChart });

  heading('Comparisons — By Supervisor');
  const bySupervisorMerged = mergeByUnion({
    callouts: analytics.bySupervisor.callouts,
    ot: analytics.bySupervisor.ot,
    moved: analytics.bySupervisor.moved,
    uncovered: analytics.bySupervisor.uncovered,
    workOrders: analytics.bySupervisor.workOrders,
  });
  const bySupervisorChart = toGroupedSeries(bySupervisorMerged);
  ensureSpace(160);
  doc.y = drawGroupedBarChart(doc, { x: left, y: doc.y, width: contentWidth, height: 150, ...bySupervisorChart });

  // --- Breakdown charts: colored horizontal bar charts ----------------
  heading('Breakdowns');
  const breakdownCharts = [
    { title: 'Call-Outs by Shuttle/Bus', data: analytics.byShuttle.callouts, color: METRIC_COLORS.callouts },
    { title: 'Call-Outs by Driver', data: analytics.byDriver.callouts, color: METRIC_COLORS.callouts },
    { title: 'Most Frequently Moved Drivers', data: analytics.byDriver.mostMoved, color: METRIC_COLORS.moved },
    { title: 'Shuttles Most Needing OT Coverage', data: analytics.byShuttle.ot, color: METRIC_COLORS.ot },
    { title: 'Shuttles Most Moved To/From', data: analytics.byShuttle.moved, color: METRIC_COLORS.moved },
    { title: 'Shuttles with Uncovered Shifts', data: analytics.byShuttle.uncovered, color: METRIC_COLORS.uncovered },
    { title: 'Incoming Supervisor Handoffs', data: analytics.incomingSupervisors, color: METRIC_COLORS.incomingSupervisors },
  ];
  const breakdownChartHeight = 6 * 14 + 20;
  for (const chart of breakdownCharts) {
    ensureSpace(breakdownChartHeight);
    doc.y = drawHorizontalBarChart(doc, { x: left, y: doc.y, width: contentWidth, limit: 6, ...chart });
    doc.moveDown(0.4);
  }

  // --- Work Orders by Location: colored pie chart ---------------------
  heading('Work Orders by Location');
  ensureSpace(90);
  doc.y = drawPieChart(doc, {
    x: left,
    y: doc.y,
    radius: 45,
    data: analytics.byLocation.workOrders,
    colors: LOCATION_COLORS,
  });

  // --- Detailed Analysis: the same drill-down tables shown on screen -
  function detailTable(columns, dataRows) {
    const colWidth = contentWidth / columns.length;

    function drawHeaderRow() {
      const y = doc.y;
      doc.fontSize(8).fillColor(INK_PRIMARY);
      columns.forEach((col, i) => doc.text(col.label, left + i * colWidth, y, { width: colWidth - 6 }));
      doc.y = y + 12;
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(LINE).stroke();
      doc.y += 3;
      doc.x = left;
    }

    ensureSpace(30);
    drawHeaderRow();

    if (!dataRows.length) {
      doc.fontSize(8).fillColor(INK_MUTED).text('No records for the selected filters.', left, doc.y, { width: contentWidth });
      doc.x = left;
      return;
    }

    for (const row of dataRows) {
      const cellTexts = columns.map((col) => String(row[col.key] ?? '—'));
      const rowHeight = Math.max(...cellTexts.map((t) => doc.heightOfString(t, { width: colWidth - 6, fontSize: 8 })), 11);

      if (doc.y + rowHeight + 4 > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawHeaderRow();
      }

      const y = doc.y;
      doc.fontSize(8).fillColor(INK_SECONDARY);
      cellTexts.forEach((text, i) => doc.text(text, left + i * colWidth, y, { width: colWidth - 6 }));
      doc.y = y + rowHeight + 4;
      doc.x = left;
    }
  }

  heading('Detailed Analysis — Driver Movement Details');
  detailTable(
    [
      { key: 'report_date', label: 'Date' },
      { key: 'shift_name', label: 'Shift' },
      { key: 'supervisor_name', label: 'Supervisor' },
      { key: 'driver_name', label: 'Driver' },
      { key: 'original_shuttle_number', label: 'From Shuttle' },
      { key: 'shuttle_number', label: 'To Shuttle' },
      { key: 'notes', label: 'Comments' },
    ],
    analytics.driverMovementDetails
  );

  heading('Detailed Analysis — Bus Issue / Uncovered Shift Details');
  detailTable(
    [
      { key: 'report_date', label: 'Date' },
      { key: 'shift_name', label: 'Shift' },
      { key: 'supervisor_name', label: 'Supervisor' },
      { key: 'shuttle_number', label: 'Shuttle/Bus' },
      { key: 'notes', label: 'Comments' },
    ],
    analytics.busIssueDetails
  );

  doc.end();
});

module.exports = router;
