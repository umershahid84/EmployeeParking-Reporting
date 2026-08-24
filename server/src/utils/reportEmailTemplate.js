const COVERAGE_LABELS = {
  ot: 'Shift Covered with OT',
  moved: 'Moved from Another Shuttle',
  not_covered: 'Shift Not Covered (Bus Issue)',
};

const BRAND_BLUE = '#0f4d99';
const BORDER = '#d7dde3';
const HEAD_BG = '#eef2f6';
const MUTED = '#6b7684';

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

/**
 * Renders a full Daily Report as a self-contained, email-client-safe HTML
 * document (table-based layout, inline styles, no external assets).
 */
function renderReportEmailHtml(report, { viewUrl } = {}) {
  const incoming = report.incomingSupervisors?.length
    ? report.incomingSupervisors.map((s) => esc(s.user_name)).join(', ')
    : 'Not specified';

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

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND_BLUE};padding:20px 28px;">
            <div style="font:700 18px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#ffffff;">Employee Parking Daily Report</div>
            <div style="font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#cfe0f5;margin-top:2px;">Report Submitted</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};width:170px;">Report ID</td>
                <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">#${esc(report.id)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">Report Date</td>
                <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${esc(report.report_date)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">Shift</td>
                <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${esc(report.shift_name)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">Submitting Supervisor</td>
                <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${esc(report.supervisor_name)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">Incoming Supervisor(s)</td>
                <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">${incoming}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};">Status</td>
                <td style="padding:4px 0;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;text-transform:capitalize;">${esc(report.status)}</td>
              </tr>
            </table>
          </td>
        </tr>

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
        </td></tr>

        ${notesRows.length ? `
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
        </td></tr>` : ''}

        <tr>
          <td style="padding:20px 28px 28px;">
            <a href="${esc(viewUrl)}" style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;text-decoration:none;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:10px 18px;border-radius:5px;">View Report in Employee Parking Reporting</a>
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
 * Plain-text fallback for mail clients that don't render HTML, or the
 * account-setup/report-detail preview shown in the [email disabled] log
 * line when SEND_EMAILS=false.
 */
function renderReportEmailText(report, { viewUrl } = {}) {
  const incoming = report.incomingSupervisors?.length ? report.incomingSupervisors.map((s) => s.user_name).join(', ') : 'Not specified';
  const lines = [
    'Employee Parking Daily Report - Report Submitted',
    '',
    `Report ID: ${report.id}`,
    `Report Date: ${report.report_date}`,
    `Shift: ${report.shift_name}`,
    `Submitting Supervisor: ${report.supervisor_name}`,
    `Incoming Supervisor(s): ${incoming}`,
    `Status: ${report.status}`,
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

  lines.push(`View the report: ${viewUrl}`);
  return lines.join('\n');
}

module.exports = { renderReportEmailHtml, renderReportEmailText };
