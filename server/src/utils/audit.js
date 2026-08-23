const pool = require('../db/pool');

/**
 * Records a system-wide audit log entry. Failures are logged but never
 * thrown, so audit logging can never break the primary request flow.
 */
async function recordAudit({ userId = null, action, entity = null, entityId = null, details = null, ipAddress = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, entity, entityId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}

module.exports = { recordAudit };
