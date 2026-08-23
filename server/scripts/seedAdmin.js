/* Creates (or resets) the initial administrator account. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function main() {
  const name = process.env.SEED_ADMIN_NAME || 'System Administrator';
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  const [roleRows] = await pool.query("SELECT id FROM roles WHERE name = 'administrator'");
  if (!roleRows[0]) throw new Error('administrator role not found - run the schema migration first.');

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role_id = VALUES(role_id), is_active = 1`,
    [name, email, passwordHash, roleRows[0].id]
  );

  console.log(`Administrator account ready: ${email} / ${password}`);
  console.log('Change this password immediately after first login.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
