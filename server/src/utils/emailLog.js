const pool = require('../db/pool');

/**
 * Records a permanent, append-only entry for every email the application
 * sends or attempts to send (including when SEND_EMAILS=false skips actual
 * delivery), so account-creation and report-submission notifications are
 * always auditable.
 */
async function recordEmailLog({ emailType, recipientEmail, relatedEntity = null, relatedId = null, status, error = null }) {
  await pool.query(
    `INSERT INTO email_log (email_type, recipient_email, related_entity, related_id, status, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [emailType, recipientEmail, relatedEntity, relatedId, status, error]
  );
}

module.exports = { recordEmailLog };
