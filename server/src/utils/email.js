const nodemailer = require('nodemailer');
const { recordEmailLog } = require('./emailLog');
const { renderReportEmailHtml, renderReportEmailText, renderManagerCommentEmailHtml, renderManagerCommentEmailText } = require('./reportEmailTemplate');
const { LOGO_PATH, logoExists } = require('./logo');

const LOGO_CID = 'port-of-seattle-logo';

let transporter = null;

function emailEnabled() {
  return process.env.SEND_EMAILS === 'true';
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 25,
    secure: process.env.EMAIL_SECURE === 'true',
    // Nodemailer attempts STARTTLS opportunistically whenever the server
    // advertises it, even with secure=false - so an internal relay with an
    // expired/self-signed cert will fail to connect unless TLS is either
    // skipped entirely or told not to validate the certificate.
    ignoreTLS: process.env.EMAIL_IGNORE_TLS === 'true',
    tls: { rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false' },
    // The internal relay used in production accepts unauthenticated mail
    // from trusted hosts, so auth is only attached when a password is set.
    auth: process.env.EMAIL_PASSWORD
      ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
      : undefined,
  });
  return transporter;
}

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

/**
 * Sends a single email and records the outcome in the email_log audit
 * trail. Never throws - delivery failures are logged, not propagated,
 * so a broken mail relay can't block report submission or user creation.
 */
async function sendMail({ to, subject, text, html, attachments, emailType, relatedEntity = null, relatedId = null }) {
  if (!emailEnabled()) {
    console.log(`[email disabled] ${emailType} to ${to}: ${subject}`);
    await recordEmailLog({ emailType, recipientEmail: to, relatedEntity, relatedId, status: 'skipped', error: 'SEND_EMAILS is not "true"' });
    return;
  }

  const from = process.env.EMAIL_SENDER || process.env.EMAIL_USER || 'no-reply@example.com';
  try {
    await getTransporter().sendMail({ from, to, subject, text, html, attachments });
    await recordEmailLog({ emailType, recipientEmail: to, relatedEntity, relatedId, status: 'sent' });
  } catch (err) {
    console.error(`Failed to send ${emailType} email to ${to}:`, err);
    await recordEmailLog({ emailType, recipientEmail: to, relatedEntity, relatedId, status: 'failed', error: String(err.message || err) });
  }
}

async function sendPasswordResetCode(toEmail, code, ttlMinutes) {
  const text = [
    'Employee Parking Reporting System',
    '',
    'Your password reset verification code is:',
    '',
    code,
    '',
    `This code will expire in ${ttlMinutes} minutes.`,
    '',
    'If you did not request a password reset, you can ignore this email.',
  ].join('\n');

  await sendMail({
    to: toEmail,
    subject: 'Employee Parking Reporting System - Password Reset Code',
    text,
    emailType: 'password_reset_code',
  });
}

/**
 * Sent when a Manager/Administrator creates a new account, or triggers an
 * admin reset. Contains a one-time secure setup link rather than a
 * plain-text password.
 */
async function sendAccountSetupEmail({ toEmail, name, setupToken, userId, isReset }) {
  const link = `${appUrl()}/setup-password?token=${encodeURIComponent(setupToken)}&uid=${userId}`;
  const text = [
    'Employee Parking Reporting System',
    '',
    isReset
      ? `Hello ${name},`
      : `Hello ${name}, an Employee Parking Reporting account has been created for you.`,
    '',
    isReset
      ? 'Your account access has been reset. Use the secure link below to set a new password:'
      : 'Use the secure link below to set your password and access the application:',
    '',
    link,
    '',
    'This link can only be used once and will expire soon for security reasons.',
    'If you did not expect this email, please contact your administrator.',
  ].join('\n');

  await sendMail({
    to: toEmail,
    subject: isReset
      ? 'Employee Parking Reporting - Account Access Reset'
      : 'Employee Parking Reporting - Your Account Has Been Created',
    text,
    emailType: isReset ? 'account_reset' : 'account_created',
    relatedEntity: 'user',
    relatedId: userId,
  });
}

/**
 * Sent to the submitting supervisor and to every active email_recipients
 * row when a Daily Report is submitted. The email body is the full report
 * (info, incoming supervisors, call-outs, shift coverage, work orders,
 * notes) rendered as a professional HTML document, not just a summary.
 */
async function sendReportSubmittedEmail({ toEmail, report }) {
  const viewUrl = `${appUrl()}/reports/${report.id}`;
  const hasLogo = logoExists();
  const html = renderReportEmailHtml(report, { viewUrl, logoCid: hasLogo ? LOGO_CID : null });
  const text = renderReportEmailText(report, { viewUrl });

  await sendMail({
    to: toEmail,
    subject: `Daily Report Submitted - ${report.report_date} (${report.shift_name})`,
    text,
    html,
    attachments: hasLogo ? [{ filename: 'port-of-seattle-logo.png', path: LOGO_PATH, cid: LOGO_CID }] : undefined,
    emailType: 'report_submitted',
    relatedEntity: 'daily_report',
    relatedId: report.id,
  });
}

/**
 * Sent to the submitting supervisor whenever a Manager (not Administrator)
 * leaves a comment on their report - includes the manager's note plus the
 * full report, so the supervisor has everything they need to review it in
 * one email without necessarily needing to click through first.
 */
async function sendManagerCommentEmail({ toEmail, report, comment, commenterName }) {
  const viewUrl = `${appUrl()}/reports/${report.id}`;
  const hasLogo = logoExists();
  const html = renderManagerCommentEmailHtml(report, { comment, commenterName, viewUrl, logoCid: hasLogo ? LOGO_CID : null });
  const text = renderManagerCommentEmailText(report, { comment, commenterName, viewUrl });

  await sendMail({
    to: toEmail,
    subject: "Please Review Manager's Note",
    text,
    html,
    attachments: hasLogo ? [{ filename: 'port-of-seattle-logo.png', path: LOGO_PATH, cid: LOGO_CID }] : undefined,
    emailType: 'manager_comment',
    relatedEntity: 'daily_report',
    relatedId: report.id,
  });
}

module.exports = { sendPasswordResetCode, sendAccountSetupEmail, sendReportSubmittedEmail, sendManagerCommentEmail, emailEnabled };
