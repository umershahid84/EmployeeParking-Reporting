import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [driverName, setDriverName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/drivers', { params: { includeInactive: '1' } });
    setDrivers(data.drivers);
  }
  useEffect(() => { load(); }, []);

  async function createDriver(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/drivers', { driverName, employeeId });
      setDriverName(''); setEmployeeId('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to add driver.');
    }
  }

  async function toggleActive(d) {
    await api.put(`/drivers/${d.id}`, { isActive: !d.is_active });
    load();
  }

  async function editDriver(d) {
    const newName = window.prompt('Driver name:', d.driver_name);
    if (newName === null) return;
    const newEmployeeId = window.prompt('Employee ID:', d.employee_id || '');
    if (newEmployeeId === null) return;
    if (newName === d.driver_name && newEmployeeId === (d.employee_id || '')) return;
    try {
      await api.put(`/drivers/${d.id}`, { driverName: newName, employeeId: newEmployeeId });
      load();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Unable to update driver.');
    }
  }

  return (
    <div>
      <form className="card" onSubmit={createDriver}>
        <h3>Add Driver</h3>
        <div className="form-row">
          <label>Driver Name <input value={driverName} onChange={(e) => setDriverName(e.target.value)} required /></label>
          <label>Employee ID <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /></label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button type="submit">Add Driver</button>
      </form>

      <table className="data-table">
        <thead><tr><th>Driver Name</th><th>Employee ID</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id}>
              <td>{d.driver_name}</td>
              <td>{d.employee_id || '—'}</td>
              <td>{d.is_active ? 'Active' : 'Inactive'}</td>
              <td className="row-actions">
                <button onClick={() => editDriver(d)}>Edit</button>
                <button onClick={() => toggleActive(d)}>{d.is_active ? 'Deactivate' : 'Reactivate'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
