import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { downloadFile } from '../utils/download';
import Logo from '../components/Logo';

export default function ReportsList() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [shifts, setShifts] = useState([]);
  // supervisorId/driverId/shuttleId aren't exposed as their own controls here -
  // they arrive via drill-down links from the Analytics dashboard.
  const [filters, setFilters] = useState(() => ({
    date: searchParams.get('date') || '',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    shiftId: searchParams.get('shiftId') || '',
    status: searchParams.get('status') || '',
    supervisorId: searchParams.get('supervisorId') || '',
    driverId: searchParams.get('driverId') || '',
    shuttleId: searchParams.get('shuttleId') || '',
  }));

  useEffect(() => {
    api.get('/shifts').then(({ data }) => setShifts(data.shifts));
  }, []);

  function activeParams() {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    return params;
  }

  async function loadReports() {
    const { data } = await api.get('/reports', { params: activeParams() });
    setReports(data.reports);
  }

  useEffect(() => { loadReports(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function exportCsv() {
    await downloadFile('/reports/export.csv', activeParams(), 'daily-reports.csv');
  }

  async function exportPdf() {
    await downloadFile('/reports/export.pdf', activeParams(), 'daily-reports.pdf');
  }

  return (
    <div className="page">
      <div className="print-header">
        <Logo />
        <div className="print-header-title">Employee Parking Daily Reports — Port of Seattle</div>
      </div>

      <div className="page-header no-print">
        <h2>All Reports</h2>
        <div className="row-actions">
          <button onClick={exportCsv}>Export CSV</button>
          <button onClick={exportPdf}>Export PDF</button>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <form className="filter-bar no-print" onSubmit={(e) => { e.preventDefault(); loadReports(); }}>
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
          <tr><th>Date</th><th>Shift</th><th>Supervisor</th><th>Last Modified</th><th>Status</th><th className="no-print"></th></tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>{r.report_date}</td>
              <td>{r.shift_name}</td>
              <td>{r.supervisor_name}</td>
              <td>{new Date(r.updated_at).toLocaleString()}</td>
              <td>{r.status}</td>
              <td className="row-actions no-print">
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
