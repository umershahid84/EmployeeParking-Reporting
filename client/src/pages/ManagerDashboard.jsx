import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ManagerDashboard() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    api.get('/reports', { params: { date: today } }).then(({ data }) => setReports(data.reports));
  }, []);

  const shiftGroups = ['Day', 'Swing', 'Graveyard', 'Bridge'].map((name) => ({
    name,
    reports: reports.filter((r) => r.shift_name === name),
  }));

  return (
    <div className="page">
      <h2>Manager Dashboard — Today's Reports</h2>
      <div className="shift-grid">
        {shiftGroups.map((g) => (
          <div className="card" key={g.name}>
            <h3>{g.name}</h3>
            {g.reports.length === 0 && <p className="muted">No report submitted yet.</p>}
            <ul>
              {g.reports.map((r) => (
                <li key={r.id}><Link to={`/reports/${r.id}`}>{r.supervisor_name} — {r.status}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
