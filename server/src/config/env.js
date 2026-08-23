/**
 * Loads the application's single root-level .env file, regardless of the
 * process's current working directory (systemd, npm workspaces, and
 * `node server/src/index.js` can all launch this from different cwds).
 *
 * This module has a load-bearing side effect (populating process.env) and
 * must be required first, before any module that reads process.env at
 * require-time (e.g. src/db/pool.js).
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

module.exports = process.env;
