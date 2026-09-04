const COVERAGE_LABELS = {
  ot: 'Shift Covered with OT',
  moved: 'Moved from Another Shuttle',
  not_covered: 'Shift Not Covered (Bus Issue)',
};

const BRAND_BLUE = '#0f4d99';
const BORDER = '#d7dde3';
const HEAD_BG = '#eef2f6';
const MUTED = '#6b7684';
const AMBER = '#b45309';
const AMBER_BG = '#fef6e7';
const AMBER_BORDER = '#f0d59a';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nl2br(value) {
  return esc(value).replace(/\n/g, '<br>');
}

function sectionTitle(text) {
  return `<tr><td style="padding:20px 0 8px;font:600 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${BRAND_BLUE};border-bottom:2px solid ${BRAND_BLUE};">${esc(text)}</td></tr>`;
}

function dataTable(headers, rows) {
  if (!rows.length) {
    return `<tr><td style="padding:6px 0 4px;font:italic 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">None reported.</td></tr>`;
  }
  const thead = headers.map((h) => `<th style="text-align:left;padding:6px 10px;background:${HEAD_BG};border:1px solid ${BORDER};font:600 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${esc(h)}</th>`).join('');
  const tbody = rows.map((cells) => (
    `<tr>${cells.map((c) => `<td style="padding:6px 10px;border:1px solid ${BORDER};font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;vertical-align:top;">${c}</td>`).join('')}</tr>`
  )).join('');
  return `<tr><td style="padding:8px 0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></td></tr>`;
}

/** The "Report Date / Shift / Supervisor / ..." info table shared by every report email. */
function reportInfoTable(report) {
  const incoming = report.incomingSupervisors?.length
    ? report.incomingSupervisors.map((s) => esc(s.user_name)).join(', ')
    : 'Not specified';

  const rows = [
    ['Report Date', esc(report.report_date)],
    ['Shift', esc(report.shift_name)],
    ['Submitting Supervisor', esc(report.supervisor_name)],
    ['Incoming Supervisor(s)', incoming],
    ['Status', esc(report.status), 'text-transform:capitalize;'],
  ];
  if (report.submitted_at) rows.push(['Submitted', esc(new Date(report.submitted_at).toLocaleString())]);
  if (report.updated_at) rows.push(['Last Edited', esc(new Date(report.updated_at).toLocaleString())]);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${rows.map(([label, value, extraStyle = '']) => `
      <tr>
        <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};width:170px;">${esc(label)}</td>
        <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;${extraStyle}">${value}</td>
      </tr>`).join('')}
  </table>`;
}

/** The Driver Call-Outs / Shift Coverage / Work Order / Shift Notes sections shared by every report email. */
function reportSectionsHtml(report) {
  const calloutRows = (report.callouts || []).map((c) => [
    esc(c.shuttle_number || '—'),
    esc(c.driver_name || '—'),
    nl2br(c.notes || '—'),
  ]);

  const coverageRows = (report.shiftCoverage || []).map((c) => [
    esc(c.driver_name || '—'),
    esc(COVERAGE_LABELS[c.coverage_type] || c.coverage_type),
    esc(c.original_shuttle_number || '—'),
    esc(c.shuttle_number || '—'),
    nl2br(c.notes || '—'),
  ]);

  const workOrderRows = (report.workOrders || []).map((w) => [
    esc(w.location),
    nl2br(w.comments || '—'),
    esc(w.user_name),
    esc(new Date(w.created_at).toLocaleString()),
  ]);

  const notesRows = [
    ['Bus Issues', report.bus_issues],
    ['Significant Activity', report.significant_activity],
    ['Additional Notes', report.notes],
  ].filter(([, v]) => v && String(v).trim());

  const sections = `
    <tr><td style="padding:0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${sectionTitle('Driver Call-Outs')}
        ${dataTable(['Shuttle/Bus #', 'Driver', 'Comments'], calloutRows)}
        ${sectionTitle('Shift Coverage')}
        ${dataTable(['Driver', 'Moved From / OT', 'Moved From Shuttle #', 'To Cover Shuttle/Bus #', 'Comments'], coverageRows)}
        ${sectionTitle('Work Order Placed')}
        ${dataTable(['Location', 'Comments', 'Entered By', 'Date/Time'], workOrderRows)}
        ${notesRows.length ? sectionTitle('Shift Notes') : ''}
      </table>
    </td></tr>`;

  const notes = notesRows.length ? `
    <tr><td style="padding:4px 28px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${notesRows.map(([label, value]) => `
          <tr>
            <td style="padding:8px 0 2px;font:600 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${esc(label)}</td>
          </tr>
          <tr>
            <td style="padding:0 0 6px;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${nl2br(value)}</td>
          </tr>
        `).join('')}
      </table>
    </td></tr>` : '';

  return sections + notes;
}

/** Shared outer envelope (fluid-width card, header band, footer, CTA button) every report email uses. */
function renderEmailShell({ headerTitle, headerSubtitle, bodyHtml, viewUrl, viewLabel, logoCid }) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND_BLUE};padding:20px 28px;">
            ${logoCid ? `<img src="cid:${esc(logoCid)}" alt="Port of Seattle" height="28" style="display:block;margin-bottom:10px;">` : ''}
            <div style="font:700 18px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#ffffff;">${esc(headerTitle)}</div>
            <div style="font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#cfe0f5;margin-top:2px;">${esc(headerSubtitle)}</div>
          </td>
        </tr>
        ${bodyHtml}
        <tr>
          <td style="padding:20px 28px 28px;">
            <a href="${esc(viewUrl)}" style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;text-decoration:none;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:10px 18px;border-radius:5px;">${esc(viewLabel)}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:${HEAD_BG};border-top:1px solid ${BORDER};">
            <div style="font:12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">Employee Parking Reporting System — automated notification</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * Renders a full Daily Report as a self-contained, email-client-safe HTML
 * document (table-based layout, inline styles, no external assets).
 */
function renderReportEmailHtml(report, { viewUrl, logoCid } = {}) {
  const bodyHtml = `
    <tr>
      <td style="padding:24px 28px 8px;">
        ${reportInfoTable(report)}
      </td>
    </tr>
    ${reportSectionsHtml(report)}`;

  return renderEmailShell({
    headerTitle: 'Employee Parking Daily Report',
    headerSubtitle: 'Report Submitted',
    bodyHtml,
    viewUrl,
    viewLabel: 'View Report in Employee Parking Reporting',
    logoCid,
  });
}

/**
 * Renders a "Please Review Manager's Note" email: the comment highlighted
 * up top, followed by the full report it was left on, so the recipient has
 * full context without needing to click through first.
 */
function renderManagerCommentEmailHtml(report, { comment, commenterName, commenterRole, viewUrl, logoCid } = {}) {
  const roleLabel = commenterRole ? ` (${commenterRole[0].toUpperCase()}${commenterRole.slice(1)})` : '';
  const noteBox = `
    <tr>
      <td style="padding:20px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${AMBER_BG};border:1px solid ${AMBER_BORDER};border-radius:6px;">
          <tr>
            <td style="padding:14px 18px;">
              <div style="font:600 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${AMBER};text-transform:uppercase;letter-spacing:0.03em;">Note from ${esc(commenterName)}${esc(roleLabel)}</div>
              <div style="font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;margin-top:6px;">${nl2br(comment)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  const bodyHtml = `
    ${noteBox}
    <tr>
      <td style="padding:20px 28px 8px;">
        ${reportInfoTable(report)}
      </td>
    </tr>
    ${reportSectionsHtml(report)}`;

  return renderEmailShell({
    headerTitle: 'Employee Parking Daily Report',
    headerSubtitle: "Please Review Manager's Note",
    bodyHtml,
    viewUrl,
    viewLabel: 'Review Report & Note',
    logoCid,
  });
}

/** The report detail lines shared by both plain-text email variants (no title, no closing "view" line - callers add their own framing around this). */
function reportTextBody(report) {
  const incoming = report.incomingSupervisors?.length ? report.incomingSupervisors.map((s) => s.user_name).join(', ') : 'Not specified';
  const lines = [
    `Report Date: ${report.report_date}`,
    `Shift: ${report.shift_name}`,
    `Submitting Supervisor: ${report.supervisor_name}`,
    `Incoming Supervisor(s): ${incoming}`,
    `Status: ${report.status}`,
    ...(report.submitted_at ? [`Submitted: ${new Date(report.submitted_at).toLocaleString()}`] : []),
    ...(report.updated_at ? [`Last Edited: ${new Date(report.updated_at).toLocaleString()}`] : []),
    '',
    '--- Driver Call-Outs ---',
    ...(report.callouts?.length
      ? report.callouts.map((c) => `Shuttle ${c.shuttle_number || '—'} / Driver ${c.driver_name || '—'}${c.notes ? ` / ${c.notes}` : ''}`)
      : ['None reported.']),
    '',
    '--- Shift Coverage ---',
    ...(report.shiftCoverage?.length
      ? report.shiftCoverage.map((c) => `${COVERAGE_LABELS[c.coverage_type] || c.coverage_type} - Shuttle ${c.shuttle_number || '—'}${c.driver_name ? ` / Driver ${c.driver_name}` : ''}${c.original_shuttle_number ? ` / From Shuttle ${c.original_shuttle_number}` : ''}${c.notes ? ` / ${c.notes}` : ''}`)
      : ['None reported.']),
    '',
    '--- Work Order Placed ---',
    ...(report.workOrders?.length
      ? report.workOrders.map((w) => `${w.location}${w.comments ? ` - ${w.comments}` : ''} (${w.user_name})`)
      : ['None reported.']),
    '',
  ];

  if (report.bus_issues) lines.push('Bus Issues:', report.bus_issues, '');
  if (report.significant_activity) lines.push('Significant Activity:', report.significant_activity, '');
  if (report.notes) lines.push('Additional Notes:', report.notes, '');

  return lines;
}

/**
 * Plain-text fallback for mail clients that don't render HTML, or the
 * account-setup/report-detail preview shown in the [email disabled] log
 * line when SEND_EMAILS=false.
 */
function renderReportEmailText(report, { viewUrl } = {}) {
  return [
    'Employee Parking Daily Report - Report Submitted',
    '',
    ...reportTextBody(report),
    `View the report: ${viewUrl}`,
  ].join('\n');
}

/** Plain-text fallback for the "Please Review Manager's Note" email. */
function renderManagerCommentEmailText(report, { comment, commenterName, commenterRole, viewUrl } = {}) {
  const roleLabel = commenterRole ? ` (${commenterRole[0].toUpperCase()}${commenterRole.slice(1)})` : '';
  return [
    "Please Review Manager's Note",
    '',
    `${commenterName}${roleLabel} left a note on this Daily Report:`,
    '',
    comment,
    '',
    '---',
    '',
    ...reportTextBody(report),
    `Review the report: ${viewUrl}`,
  ].join('\n');
}

/** A single label/value summary row (e.g. "Week Covered" or "Reports Included") atop a rollup digest email. */
function digestSummaryRow(label, value) {
  return `
    <tr>
      <td style="padding:24px 28px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};width:170px;">${esc(label)}</td>
            <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${esc(value)}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/**
 * The Driver Call-Out / Shift Coverage / Work Order Placed / Shift Notes
 * rollup tables shared by every multi-report digest email (the weekly
 * report and the report-submission digest to Managers) - as opposed to
 * reportSectionsHtml above, which renders a single report's own sections.
 */
function digestSectionsHtml(data) {
  const calloutRows = (data.callouts || []).map((c) => [
    esc(c.report_date),
    esc(c.shift_name),
    esc(c.supervisor_name),
    esc(c.shuttle_number || '—'),
    esc(c.driver_name || '—'),
    nl2br(c.notes || '—'),
  ]);

  const coverageRows = (data.coverage || []).map((c) => [
    esc(c.report_date),
    esc(c.shift_name),
    esc(c.supervisor_name),
    esc(COVERAGE_LABELS[c.coverage_type] || c.coverage_type),
    esc(c.original_shuttle_number || '—'),
    esc(c.shuttle_number || '—'),
    nl2br(c.notes || '—'),
  ]);

  const workOrderRows = (data.workOrders || []).map((w) => [
    esc(w.report_date),
    esc(w.shift_name),
    esc(w.entered_by),
    esc(w.location),
    nl2br(w.comments || '—'),
  ]);

  const notesRows = (list) => (list || []).map((n) => [
    esc(n.report_date),
    esc(n.shift_name),
    esc(n.supervisor_name),
    nl2br(n.comments),
  ]);

  return `
    <tr><td style="padding:0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${sectionTitle('Driver Call-Out')}
        ${dataTable(['Report Date', 'Shift', 'Submitted by', 'Shuttle/Bus #', 'Driver', 'Comments'], calloutRows)}
        ${sectionTitle('Shift Coverage')}
        ${dataTable(['Report Date', 'Shift', 'Submitted by', 'Moved From / OT', 'Moved From Shuttle #', 'To Cover Shuttle/Bus #', 'Comments'], coverageRows)}
        ${sectionTitle('Work Order Placed')}
        ${dataTable(['Report Date', 'Shift', 'Entered by', 'Location', 'Comments'], workOrderRows)}
        ${sectionTitle('Shift Notes')}
      </table>
    </td></tr>
    <tr><td style="padding:4px 28px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0 4px;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">Bus Issues</td></tr>
        ${dataTable(['Report Date', 'Shift', 'Submitted by', 'Comments'], notesRows(data.busIssues))}
        <tr><td style="padding:14px 0 4px;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">Significant Activity</td></tr>
        ${dataTable(['Report Date', 'Shift', 'Submitted by', 'Comments'], notesRows(data.significantActivity))}
        <tr><td style="padding:14px 0 4px;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">Additional Notes</td></tr>
        ${dataTable(['Report Date', 'Shift', 'Submitted by', 'Comments'], notesRows(data.additionalNotes))}
      </table>
    </td></tr>`;
}

/** The plain-text rollup lines shared by every multi-report digest email. */
function digestTextLines(data) {
  const line = (label, list, fields) => [
    `--- ${label} ---`,
    ...(list?.length ? list.map((r) => fields.map((f) => r[f]).filter(Boolean).join(' / ')) : ['None reported.']),
    '',
  ];

  return [
    ...line('Driver Call-Out', data.callouts, ['report_date', 'shift_name', 'supervisor_name', 'shuttle_number', 'driver_name', 'notes']),
    ...line('Shift Coverage', data.coverage, ['report_date', 'shift_name', 'supervisor_name', 'coverage_type', 'original_shuttle_number', 'shuttle_number', 'notes']),
    ...line('Work Order Placed', data.workOrders, ['report_date', 'shift_name', 'entered_by', 'location', 'comments']),
    ...line('Shift Notes - Bus Issues', data.busIssues, ['report_date', 'shift_name', 'supervisor_name', 'comments']),
    ...line('Shift Notes - Significant Activity', data.significantActivity, ['report_date', 'shift_name', 'supervisor_name', 'comments']),
    ...line('Shift Notes - Additional Notes', data.additionalNotes, ['report_date', 'shift_name', 'supervisor_name', 'comments']),
  ];
}

/**
 * Renders the weekly digest sent to every Manager each Monday at 04:00,
 * aggregating every supervisor's submitted Daily Reports from the prior
 * Monday-Sunday week into one set of rollup tables (as opposed to the
 * single-report layout the other templates use).
 */
function renderWeeklyReportEmailHtml(data, { startDate, endDate, viewUrl, logoCid } = {}) {
  const bodyHtml = digestSummaryRow('Week Covered', `${startDate} to ${endDate}`) + digestSectionsHtml(data);

  return renderEmailShell({
    headerTitle: 'Employee Parking Weekly Report',
    headerSubtitle: `Week of ${startDate} to ${endDate}`,
    bodyHtml,
    viewUrl,
    viewLabel: 'Open Employee Parking Reporting',
    logoCid,
  });
}

/** Plain-text fallback for the weekly digest email. */
function renderWeeklyReportEmailText(data, { startDate, endDate, viewUrl } = {}) {
  return [
    'Employee Parking Weekly Report',
    `Week Covered: ${startDate} to ${endDate}`,
    '',
    ...digestTextLines(data),
    `Open the application: ${viewUrl}`,
  ].join('\n');
}

/**
 * Renders the digest sent to every Manager as soon as a Supervisor submits
 * a Daily Report, rolling up the most recently submitted reports
 * system-wide (across all supervisors) into the same section layout as the
 * weekly report - just scoped to a report count instead of a date range.
 */
function renderRecentReportsEmailHtml(data, { reportCount, viewUrl, logoCid } = {}) {
  const bodyHtml = digestSummaryRow('Reports Included', `Last ${reportCount} Submitted Report${reportCount === 1 ? '' : 's'}`) + digestSectionsHtml(data);

  return renderEmailShell({
    headerTitle: 'Employee Parking Daily Report Digest',
    headerSubtitle: `Last ${reportCount} Submitted Report${reportCount === 1 ? '' : 's'}`,
    bodyHtml,
    viewUrl,
    viewLabel: 'Open Employee Parking Reporting',
    logoCid,
  });
}

/** Plain-text fallback for the report-submission digest email. */
function renderRecentReportsEmailText(data, { reportCount, viewUrl } = {}) {
  return [
    'Employee Parking Daily Report Digest',
    `Reports Included: Last ${reportCount} Submitted Report${reportCount === 1 ? '' : 's'}`,
    '',
    ...digestTextLines(data),
    `Open the application: ${viewUrl}`,
  ].join('\n');
}

module.exports = {
  renderReportEmailHtml,
  renderReportEmailText,
  renderManagerCommentEmailHtml,
  renderManagerCommentEmailText,
  renderWeeklyReportEmailHtml,
  renderWeeklyReportEmailText,
  renderRecentReportsEmailHtml,
  renderRecentReportsEmailText,
};
