const pool = require('../db/pool');

/**
 * Appends an entry to the immutable report edit history.
 */
async function recordHistory({ reportId, userId, action, fieldChanged = null, previousValue = null, newValue = null }) {
  await pool.query(
    `INSERT INTO report_history (report_id, user_id, action, field_changed, previous_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reportId, userId, action, fieldChanged, previousValue, newValue]
  );
}

module.exports = { recordHistory };
