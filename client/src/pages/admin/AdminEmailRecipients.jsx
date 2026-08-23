import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminEmailRecipients() {
  const [recipients, setRecipients] = useState([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/email-recipients');
    setRecipients(data.recipients);
  }
  useEffect(() => { load(); }, []);

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
