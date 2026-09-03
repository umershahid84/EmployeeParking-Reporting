import { useEffect, useState } from 'react';
import api from '../../api/client';
import Toggle from '../../components/Toggle';

function formatTime(time) {
  const [h, m] = (time || '').split(':').map(Number);
  if (Number.isNaN(h)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export default function AdminEmailRecipients() {
  const [recipients, setRecipients] = useState([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const [schedule, setSchedule] = useState(null);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  async function load() {
    const { data } = await api.get('/email-recipients');
    setRecipients(data.recipients);
  }
  async function loadSchedule() {
    const { data } = await api.get('/settings/weekly-report');
    setSchedule(data);
  }
  useEffect(() => { load(); loadSchedule(); }, []);

  async function saveSchedule(e) {
    e.preventDefault();
    setScheduleError(''); setScheduleMessage('');
    try {
      const { data } = await api.put('/settings/weekly-report', schedule);
      setSchedule(data);
      setScheduleMessage('Weekly report schedule saved.');
    } catch (err) {
      setScheduleError(err.response?.data?.error || 'Unable to save schedule.');
    }
  }

  async function addRecipient(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/email-recipients', { email, notificationType: 'daily_report' });
      setEmail('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to add recipient.');
    }
  }

  async function toggleActive(r) {
    await api.put(`/email-recipients/${r.id}`, { isActive: !r.is_active });
    load();
  }

  async function editEmail(r) {
    const newEmail = window.prompt('Update email address:', r.email);
    if (!newEmail || newEmail === r.email) return;
    try {
      await api.put(`/email-recipients/${r.id}`, { email: newEmail });
      load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Unable to update recipient.');
    }
  }

  async function removeRecipient(r) {
    if (!window.confirm(`Remove ${r.email} from the daily report distribution list?`)) return;
    await api.delete(`/email-recipients/${r.id}`);
    load();
  }

  return (
    <div>
      <form className="card schedule-card" onSubmit={saveSchedule}>
        <div className="schedule-card-header">
          <div>
            <h3>Weekly Report Schedule</h3>
            <p className="muted">
              Every active Manager automatically receives a weekly digest (Driver Call-Out, Shift Coverage,
              Work Order Placed, and Shift Notes) rolling up the prior week's submitted Daily Reports.
            </p>
          </div>
          {schedule && (
            <span className={`schedule-badge ${schedule.enabled ? 'on' : ''}`}>
              {schedule.enabled
                ? `Active — ${WEEKDAYS.find((d) => d.value === schedule.dayOfWeek)?.label} ${formatTime(schedule.time)}`
                : 'Disabled'}
            </span>
          )}
        </div>

        {schedule && (
          <>
            <div className="schedule-fields">
              <Toggle
                checked={schedule.enabled}
                onChange={(checked) => setSchedule({ ...schedule, enabled: checked })}
                label="Send weekly report"
              />
              <label>Day of Week
                <select
                  value={schedule.dayOfWeek}
                  onChange={(e) => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}
                  disabled={!schedule.enabled}
                >
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label>Time
                <input
                  type="time"
                  value={schedule.time}
                  onChange={(e) => setSchedule({ ...schedule, time: e.target.value })}
                  disabled={!schedule.enabled}
                  required
                />
              </label>
            </div>

            <div className="schedule-form-footer">
              {scheduleError && <div className="error-text">{scheduleError}</div>}
              {scheduleMessage && <div className="info-text">{scheduleMessage}</div>}
              <button type="submit">Save Schedule</button>
            </div>
          </>
        )}
      </form>

      <p className="muted">
        Everyone active on this list receives an email whenever a Supervisor submits a Daily Report.
      </p>

      <form className="card" onSubmit={addRecipient}>
        <h3>Add Recipient</h3>
        <div className="form-row">
          <label>Email Address <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button type="submit">Add Recipient</button>
      </form>

      <table className="data-table">
        <thead><tr><th>Email Address</th><th>Active</th><th>Notification</th><th></th></tr></thead>
        <tbody>
          {recipients.map((r) => (
            <tr key={r.id}>
              <td>{r.email}</td>
              <td>{r.is_active ? 'Yes' : 'No'}</td>
              <td>Daily Reports</td>
              <td className="row-actions">
                <button onClick={() => toggleActive(r)}>{r.is_active ? 'Disable' : 'Enable'}</button>
                <button onClick={() => editEmail(r)}>Edit</button>
                <button onClick={() => removeRecipient(r)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!recipients.length && <p className="muted">No recipients configured yet.</p>}
    </div>
  );
}
