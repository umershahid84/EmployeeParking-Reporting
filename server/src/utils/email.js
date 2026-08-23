const nodemailer = require('nodemailer');

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
    // The internal relay used in production accepts unauthenticated mail
    // from trusted hosts, so auth is only attached when a password is set.
    auth: process.env.EMAIL_PASSWORD
      ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
      : undefined,
  });
  return transporter;
}

async function sendPasswordResetCode(toEmail, code, ttlMinutes) {
  const from = process.env.EMAIL_SENDER || process.env.EMAIL_USER || 'no-reply@example.com';
  const subject = 'Employee Parking Reporting System - Password Reset Code';
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

  if (!emailEnabled()) {
    // SEND_EMAILS=false: no mail server dependency required. Log instead so
    // the reset flow is still usable in local/dev environments.
    console.log(`[email disabled] Password reset code for ${toEmail}: ${code} (expires in ${ttlMinutes}m)`);
    return;
  }

  try {
    await getTransporter().sendMail({ from, to: toEmail, subject, text });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    throw err;
  }
}

module.exports = { sendPasswordResetCode, emailEnabled };
