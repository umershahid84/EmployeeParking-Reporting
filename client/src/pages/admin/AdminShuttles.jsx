import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminShuttles() {
  const [shuttles, setShuttles] = useState([]);
  const [shuttleNumber, setShuttleNumber] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/shuttles', { params: { includeInactive: '1' } });
    setShuttles(data.shuttles);
  }
  useEffect(() => { load(); }, []);

  async function createShuttle(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/shuttles', { shuttleNumber });
      setShuttleNumber('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to add shuttle.');
    }
  }

  async function toggleActive(s) {
    await api.put(`/shuttles/${s.id}`, { isActive: !s.is_active });
    load();
  }

  async function editShuttle(s) {
    const newNumber = window.prompt('Shuttle/Bus number:', s.shuttle_number);
    if (newNumber === null || newNumber === s.shuttle_number) return;
    try {
      await api.put(`/shuttles/${s.id}`, { shuttleNumber: newNumber });
      load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Unable to update shuttle.');
    }
  }

  return (
    <div>
      <form className="card" onSubmit={createShuttle}>
        <h3>Add Shuttle</h3>
        <label>Shuttle Number <input value={shuttleNumber} onChange={(e) => setShuttleNumber(e.target.value)} required /></label>
        {error && <div className="error-text">{error}</div>}
        <button type="submit">Add Shuttle</button>
      </form>

      <table className="data-table">
        <thead><tr><th>Shuttle #</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {shuttles.map((s) => (
            <tr key={s.id}>
              <td>{s.shuttle_number}</td>
              <td>{s.is_active ? 'Active' : 'Inactive'}</td>
              <td className="row-actions">
                <button onClick={() => editShuttle(s)}>Edit</button>
                <button onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Reactivate'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
