const express = require('express');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { getWeeklyReportSchedule, setWeeklyReportSchedule } = require('../utils/settings');
const { applyWeeklyReportSchedule } = require('../jobs/weeklyReport');

const router = express.Router();

// All routes here require administrator.
router.use(requireAuth, requireMinRole('administrator'));

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// GET /api/settings/weekly-report
router.get('/weekly-report', async (req, res) => {
  const schedule = await getWeeklyReportSchedule();
  res.json(schedule);
});

// PUT /api/settings/weekly-report
// Re-applies the live cron schedule immediately after saving, so a changed
// day/time/enabled setting takes effect without a server restart.
router.put('/weekly-report', async (req, res) => {
  const { dayOfWeek, time, enabled } = req.body || {};

  const day = Number(dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return res.status(400).json({ error: 'Day of week must be an integer from 0 (Sunday) to 6 (Saturday).' });
  }
  if (!TIME_RE.test(time || '')) {
    return res.status(400).json({ error: 'Time must be in HH:MM (24-hour) format.' });
  }

  await setWeeklyReportSchedule({ dayOfWeek: day, time, enabled: !!enabled });
  await applyWeeklyReportSchedule();
  await recordAudit({
    userId: req.user.id,
    action: 'weekly_report_schedule_updated',
    entity: 'app_settings',
    details: { dayOfWeek: day, time, enabled: !!enabled },
    ipAddress: req.ip,
  });

  res.json(await getWeeklyReportSchedule());
});

module.exports = router;
