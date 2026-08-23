import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [filters, setFilters] = useState({ date: '', dateFrom: '', dateTo: '', shiftId: '', status: '' });

  useEffect(() => {
    api.get('/shifts').then(({ data }) => setShifts(data.shifts));
  }, []);

  async function loadReports() {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    const { data } = await api.get('/reports', { params });
    setReports(data.reports);
  }

  useEffect(() => { loadReports(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="page">
      <h2>All Reports</h2>

      <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); loadReports(); }}>
        <label>Date <input type="date" value={filters.date} onChange={(e) => updateFilter('date', e.target.value)} /></label>
        <label>From <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} /></label>
        <label>To <input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} /></label>
        <label>Shift
          <select value={filters.shiftId} onChange={(e) => updateFilter('shiftId', e.target.value)}>
            <option value="">All Shifts</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Status
          <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="edited">Edited</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <button type="submit">Apply Filters</button>
      </form>

      <table className="data-table">
        <thead>
          <tr><th>Date</th><th>Shift</th><th>Supervisor</th><th>Last Modified</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>{r.report_date}</td>
              <td>{r.shift_name}</td>
              <td>{r.supervisor_name}</td>
              <td>{new Date(r.updated_at).toLocaleString()}</td>
              <td>{r.status}</td>
              <td className="row-actions">
                <Link to={`/reports/${r.id}`}>View</Link>
                {(user.role === 'administrator' || r.supervisor_id === user.id) && (
                  <Link to={`/reports/${r.id}/edit`}>Edit</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!reports.length && <p className="muted">No reports match the current filters.</p>}
    </div>
  );
}
