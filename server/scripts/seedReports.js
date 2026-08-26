/*
 * Seeds random Daily Reports for local development / demoing the Analytics
 * dashboard with realistic volume. Creates whatever supporting supervisors,
 * drivers, and shuttles are missing (reusing what already exists in the
 * database instead of duplicating it), then generates the requested number
 * of submitted reports spread over the last 90 days with randomized
 * call-outs, shift coverage, work orders, and incoming supervisors.
 *
 * Usage:
 *   node scripts/seedReports.js [count]
 *   COUNT=250 node scripts/seedReports.js
 *
 * Defaults to 100 reports. Safe to run multiple times - it only ever adds
 * new reports, never touches existing ones.
 */
require('../src/config/env');
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');
const { recordHistory } = require('../src/utils/history');

const SAMPLE_SUPERVISORS = [
  'Alex Rivera', 'Jordan Lee', 'Taylor Morgan', 'Casey Nguyen', 'Sam Patel',
  'Jamie Brooks', 'Morgan Ellis', 'Riley Chen', 'Dakota Reyes', 'Skyler Owens',
];
const SAMPLE_DRIVERS = [
  'John Doe', 'Maria Garcia', 'James Smith', 'Linda Johnson', 'Robert Davis',
  'Patricia Wilson', 'Michael Brown', 'Barbara Miller', 'David Anderson', 'Susan Taylor',
  'Chris Thomas', 'Nancy Jackson', 'Daniel White', 'Karen Harris', 'Paul Martin',
];
const SAMPLE_SHUTTLES = ['101', '102', '103', '104', '105', '106', '107', '108'];
const WORK_ORDER_LOCATIONS = ['LOT - A', 'LOT - C', 'North Employee Parking Lot'];
const BUS_ISSUES = [
  'Shuttle 103 reported a check-engine light, taken out of rotation for inspection.',
  'Minor fender bender in the lot, no injuries, report filed with security.',
  'Shuttle AC unit not working, maintenance notified.',
  'Flat tire on route, spare swapped, back in service within the hour.',
  null, null, null,
];
const SIGNIFICANT_ACTIVITY = [
  'Higher than normal passenger volume due to a large conference at the terminal.',
  'Ran a modified schedule during the morning rush due to road construction.',
  'Coordinated with airport ops on a temporary lot closure.',
  'Quiet shift, no notable activity.',
  null, null,
];
const NOTES = [
  'All shifts covered, no outstanding issues.',
  'Reminder sent to team about updated radio channel.',
  'Handed off open items to incoming supervisor verbally and in this report.',
  null, null,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickSome(arr, min, max) {
  const count = Math.min(arr.length, min + Math.floor(Math.random() * (max - min + 1)));
  const pool = [...arr];
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function randomDateWithinDays(days) {
  const offset = Math.floor(Math.random() * days);
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

async function ensureRole(name) {
  const [rows] = await pool.query('SELECT id FROM roles WHERE name = ?', [name]);
  if (!rows[0]) throw new Error(`Role "${name}" not found - run the schema migration first.`);
  return rows[0].id;
}

async function ensureSupervisors(minCount) {
  const [existing] = await pool.query(
    `SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'supervisor' AND u.is_active = 1`
  );
  if (existing.length >= minCount) return existing;

  const supervisorRoleId = await ensureRole('supervisor');
  const passwordHash = await bcrypt.hash('SeedData123!', 12);
  const needed = minCount - existing.length;
  const names = pickSome(SAMPLE_SUPERVISORS, needed, needed);

  for (const name of names) {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE id = id`,
      [name, email, passwordHash, supervisorRoleId]
    );
    if (result.insertId) existing.push({ id: result.insertId, name });
  }

  const [refreshed] = await pool.query(
    `SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'supervisor' AND u.is_active = 1`
  );
  return refreshed;
}

async function ensureDrivers(minCount) {
  const [existing] = await pool.query('SELECT id, driver_name FROM drivers WHERE is_active = 1');
  if (existing.length >= minCount) return existing;

  const needed = minCount - existing.length;
  const names = pickSome(SAMPLE_DRIVERS, needed, needed);
  for (const name of names) {
    const [result] = await pool.query('INSERT INTO drivers (driver_name, is_active) VALUES (?, 1)', [name]);
    existing.push({ id: result.insertId, driver_name: name });
  }
  return existing;
}

async function ensureShuttles(minCount) {
  const [existing] = await pool.query('SELECT id, shuttle_number FROM shuttles WHERE is_active = 1');
  if (existing.length >= minCount) return existing;

  const needed = minCount - existing.length;
  const numbers = pickSome(SAMPLE_SHUTTLES, needed, needed);
  for (const number of numbers) {
    const [result] = await pool.query('INSERT INTO shuttles (shuttle_number, is_active) VALUES (?, 1)', [number]);
    existing.push({ id: result.insertId, shuttle_number: number });
  }
  return existing;
}

async function seedOneReport({ shiftIds, supervisors, drivers, shuttles }) {
  const supervisor = pick(supervisors);
  const shiftId = pick(shiftIds);
  const reportDate = randomDateWithinDays(90);
  const submittedAt = `${reportDate} ${String(6 + Math.floor(Math.random() * 12)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;

  const [result] = await pool.query(
    `INSERT INTO daily_reports (report_date, shift_id, supervisor_id, status, bus_issues, significant_activity, notes, submitted_at)
     VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?)`,
    [reportDate, shiftId, supervisor.id, pick(BUS_ISSUES), pick(SIGNIFICANT_ACTIVITY), pick(NOTES), submittedAt]
  );
  const reportId = result.insertId;

  const incoming = pickSome(
    supervisors.filter((s) => s.id !== supervisor.id),
    0,
    2
  );
  for (const sup of incoming) {
    await pool.query(
      'INSERT IGNORE INTO report_incoming_supervisors (report_id, user_id) VALUES (?, ?)',
      [reportId, sup.id]
    );
  }

  const calloutCount = Math.floor(Math.random() * 4);
  for (let i = 0; i < calloutCount; i += 1) {
    await pool.query(
      'INSERT INTO driver_callouts (report_id, shuttle_id, driver_id, notes) VALUES (?, ?, ?, ?)',
      [reportId, pick(shuttles).id, pick(drivers).id, Math.random() < 0.5 ? 'Called out sick.' : null]
    );
  }

  const coverageCount = Math.floor(Math.random() * 4);
  for (let i = 0; i < coverageCount; i += 1) {
    const type = pick(['ot', 'moved', 'not_covered']);
    if (type === 'ot') {
      await pool.query(
        'INSERT INTO shift_coverage (report_id, coverage_type, shuttle_id, driver_id, notes) VALUES (?, ?, ?, ?, ?)',
        [reportId, type, pick(shuttles).id, pick(drivers).id, Math.random() < 0.4 ? 'Covered with overtime.' : null]
      );
    } else if (type === 'moved') {
      const [toShuttle, fromShuttle] = pickSome(shuttles, 2, 2);
      await pool.query(
        `INSERT INTO shift_coverage (report_id, coverage_type, shuttle_id, driver_id, original_shuttle_id, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [reportId, type, toShuttle.id, pick(drivers).id, fromShuttle.id, Math.random() < 0.4 ? 'Moved to cover open shift.' : null]
      );
    } else {
      await pool.query(
        'INSERT INTO shift_coverage (report_id, coverage_type, shuttle_id, notes) VALUES (?, ?, ?, ?)',
        [reportId, type, pick(shuttles).id, Math.random() < 0.6 ? 'Bus broke down, shift not covered.' : null]
      );
    }
  }

  const workOrderCount = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 2) : 0;
  for (let i = 0; i < workOrderCount; i += 1) {
    await pool.query(
      'INSERT INTO work_orders (report_id, location, comments, user_id) VALUES (?, ?, ?, ?)',
      [reportId, pick(WORK_ORDER_LOCATIONS), Math.random() < 0.5 ? 'Pothole reported, work order placed.' : null, supervisor.id]
    );
  }

  await recordHistory({ reportId, userId: supervisor.id, action: 'submitted' });

  return reportId;
}

async function main() {
  const count = Number(process.argv[2] || process.env.COUNT || 100);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Report count must be a positive integer.');
  }

  const [shiftRows] = await pool.query('SELECT id FROM shifts');
  if (!shiftRows.length) throw new Error('No shifts found - run the schema migration first.');
  const shiftIds = shiftRows.map((r) => r.id);

  const supervisors = await ensureSupervisors(5);
  const drivers = await ensureDrivers(10);
  const shuttles = await ensureShuttles(6);

  console.log(`Seeding ${count} random daily reports using ${supervisors.length} supervisors, ${drivers.length} drivers, ${shuttles.length} shuttles...`);

  for (let i = 0; i < count; i += 1) {
    await seedOneReport({ shiftIds, supervisors, drivers, shuttles });
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${count} reports created`);
  }

  console.log(`Done - ${count} random daily reports seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
