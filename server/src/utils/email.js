const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

async function sendPasswordResetCode(toEmail, code, ttlMinutes) {
  const from = process.env.EMAIL_FROM || 'no-reply@example.com';
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

  try {
    await getTransporter().sendMail({ from, to: toEmail, subject, text });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    throw err;
  }
}

module.exports = { sendPasswordResetCode };
