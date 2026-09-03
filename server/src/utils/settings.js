const pool = require('../db/pool');

async function getSetting(key, defaultValue = null) {
  const [rows] = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
  return rows[0] ? rows[0].setting_value : defaultValue;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

const WEEKLY_REPORT_DAY_KEY = 'weekly_report_day_of_week';
const WEEKLY_REPORT_TIME_KEY = 'weekly_report_time';
const WEEKLY_REPORT_ENABLED_KEY = 'weekly_report_enabled';

// Defaults match the original hard-coded schedule: every Monday at 04:00.
const DEFAULT_WEEKLY_REPORT_SCHEDULE = { dayOfWeek: 1, time: '04:00', enabled: true };

/** dayOfWeek follows JS Date.getDay()/cron dow convention: 0=Sunday..6=Saturday. */
async function getWeeklyReportSchedule() {
  const [dayOfWeek, time, enabled] = await Promise.all([
    getSetting(WEEKLY_REPORT_DAY_KEY, String(DEFAULT_WEEKLY_REPORT_SCHEDULE.dayOfWeek)),
    getSetting(WEEKLY_REPORT_TIME_KEY, DEFAULT_WEEKLY_REPORT_SCHEDULE.time),
    getSetting(WEEKLY_REPORT_ENABLED_KEY, DEFAULT_WEEKLY_REPORT_SCHEDULE.enabled ? '1' : '0'),
  ]);
  return { dayOfWeek: Number(dayOfWeek), time, enabled: enabled === '1' };
}

async function setWeeklyReportSchedule({ dayOfWeek, time, enabled }) {
  await Promise.all([
    setSetting(WEEKLY_REPORT_DAY_KEY, String(dayOfWeek)),
    setSetting(WEEKLY_REPORT_TIME_KEY, time),
    setSetting(WEEKLY_REPORT_ENABLED_KEY, enabled ? '1' : '0'),
  ]);
}

module.exports = { getSetting, setSetting, getWeeklyReportSchedule, setWeeklyReportSchedule };
