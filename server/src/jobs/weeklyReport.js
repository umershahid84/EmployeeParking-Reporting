const pool = require('../db/pool');
const { sendWeeklyReportEmail } = require('../utils/email');
const { recordAudit } = require('../utils/audit');
const { getWeeklyReportSchedule } = require('../utils/settings');

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Monday-Sunday range for the week immediately before the week containing
 * `reference` - e.g. for a job firing Monday 04:00, this is "yesterday and
 * the six days before it," not the week still in progress.
 */
function previousWeekRange(reference = new Date()) {
  const daysSinceMonday = (reference.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const thisMonday = new Date(reference);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);

  const start = new Date(thisMonday);
  start.setDate(start.getDate() - 7);
  const end = new Date(thisMonday);
  end.setDate(end.getDate() - 1);

  return { startDate: toDateStr(start), endDate: toDateStr(end) };
}

/**
 * Aggregates every supervisor's submitted Daily Report content (excluding
 * drafts) across the given date range into the section rollups the weekly
 * digest email needs. Mirrors the join patterns in routes/reports.js'
 * loadReportFull, but across many reports instead of one.
 */
async function buildWeeklyReportData(startDate, endDate) {
  const [callouts] = await pool.query(
    `SELECT dr.report_date, s.name AS shift_name, u.name AS supervisor_name,
            sh.shuttle_number, dv.driver_name, c.notes
     FROM driver_callouts c
     JOIN daily_reports dr ON dr.id = c.report_id
     JOIN shifts s ON s.id = dr.shift_id
     JOIN users u ON u.id = dr.supervisor_id
     LEFT JOIN shuttles sh ON sh.id = c.shuttle_id
     LEFT JOIN drivers dv ON dv.id = c.driver_id
     WHERE dr.report_date BETWEEN ? AND ? AND dr.status != 'draft'
     ORDER BY dr.report_date, s.name, c.id`,
    [startDate, endDate]
  );

  const [coverage] = await pool.query(
    `SELECT dr.report_date, s.name AS shift_name, u.name AS supervisor_name,
            sc.coverage_type, osh.shuttle_number AS original_shuttle_number,
            sh.shuttle_number, sc.notes
     FROM shift_coverage sc
     JOIN daily_reports dr ON dr.id = sc.report_id
     JOIN shifts s ON s.id = dr.shift_id
     JOIN users u ON u.id = dr.supervisor_id
     LEFT JOIN shuttles sh ON sh.id = sc.shuttle_id
     LEFT JOIN shuttles osh ON osh.id = sc.original_shuttle_id
     WHERE dr.report_date BETWEEN ? AND ? AND dr.status != 'draft'
     ORDER BY dr.report_date, s.name, sc.id`,
    [startDate, endDate]
  );

  const [workOrders] = await pool.query(
    `SELECT dr.report_date, s.name AS shift_name, u.name AS entered_by,
            wo.location, wo.comments
     FROM work_orders wo
     JOIN daily_reports dr ON dr.id = wo.report_id
     JOIN shifts s ON s.id = dr.shift_id
     JOIN users u ON u.id = wo.user_id
     WHERE dr.report_date BETWEEN ? AND ? AND dr.status != 'draft'
     ORDER BY dr.report_date, s.name, wo.id`,
    [startDate, endDate]
  );

  const [notes] = await pool.query(
    `SELECT dr.report_date, s.name AS shift_name, u.name AS supervisor_name,
            dr.bus_issues, dr.significant_activity, dr.notes
     FROM daily_reports dr
     JOIN shifts s ON s.id = dr.shift_id
     JOIN users u ON u.id = dr.supervisor_id
     WHERE dr.report_date BETWEEN ? AND ? AND dr.status != 'draft'
       AND (
         (dr.bus_issues IS NOT NULL AND dr.bus_issues != '')
         OR (dr.significant_activity IS NOT NULL AND dr.significant_activity != '')
         OR (dr.notes IS NOT NULL AND dr.notes != '')
       )
     ORDER BY dr.report_date, s.name`,
    [startDate, endDate]
  );

  const pick = (field) => notes
    .filter((n) => n[field] && String(n[field]).trim())
    .map((n) => ({ report_date: n.report_date, shift_name: n.shift_name, supervisor_name: n.supervisor_name, comments: n[field] }));

  return {
    callouts,
    coverage,
    workOrders,
    busIssues: pick('bus_issues'),
    significantActivity: pick('significant_activity'),
    additionalNotes: pick('notes'),
  };
}

/**
 * Builds and sends the weekly digest to every active Manager, covering the
 * Monday-Sunday week before `reference` (defaults to now, i.e. "last week"
 * when run by the Monday 04:00 schedule). Never throws - per-recipient send
 * failures are logged by sendMail, not propagated.
 */
async function sendWeeklyReportEmails(reference = new Date()) {
  const { startDate, endDate } = previousWeekRange(reference);
  const data = await buildWeeklyReportData(startDate, endDate);

  const [managerRows] = await pool.query(
    `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'manager' AND u.is_active = 1`
  );
  const recipientEmails = [...new Set(managerRows.map((r) => r.email.toLowerCase()))];
  if (!recipientEmails.length) return { startDate, endDate, sent: 0 };

  for (const email of recipientEmails) {
    await sendWeeklyReportEmail({ toEmail: email, startDate, endDate, data });
  }

  await recordAudit({
    action: 'weekly_report_email_sent',
    entity: 'weekly_report',
    details: { startDate, endDate, recipients: recipientEmails },
  });

  return { startDate, endDate, sent: recipientEmails.length };
}

let currentTask = null;

/**
 * (Re)applies the weekly digest schedule from app_settings (managed via the
 * Admin Portal's Email Notifications page). Stops any previously scheduled
 * cron task before starting a new one, so this is safe to call again
 * whenever an administrator changes the day/time/enabled setting - no
 * restart required for a schedule change to take effect.
 */
async function applyWeeklyReportSchedule() {
  const cron = require('node-cron');
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  const { dayOfWeek, time, enabled } = await getWeeklyReportSchedule();
  if (!enabled) return;

  const [hour, minute] = (time || '04:00').split(':').map(Number);
  const cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
  currentTask = cron.schedule(cronExpression, () => {
    sendWeeklyReportEmails().catch((err) => console.error('Weekly report job failed:', err));
  });
}

module.exports = {
  previousWeekRange,
  buildWeeklyReportData,
  sendWeeklyReportEmails,
  applyWeeklyReportSchedule,
};
