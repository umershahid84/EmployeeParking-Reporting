const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const SETUP_TOKEN_TTL_HOURS = Number(process.env.ACCOUNT_SETUP_TOKEN_TTL_HOURS) || 48;

/**
 * Creates a one-time account setup/reset token for a user and returns the
 * raw token (only the bcrypt hash is stored, matching how password reset
 * codes are handled). The caller is responsible for emailing the raw token
 * as part of a link - it is never logged or returned to an API caller.
 */
async function createSetupToken(userId, purpose = 'initial_setup') {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO account_setup_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)`,
    [userId, tokenHash, purpose, expiresAt]
  );

  return rawToken;
}

module.exports = { createSetupToken, SETUP_TOKEN_TTL_HOURS };
