import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState([]);
  const [mine, setMine] = useState([]);

  useEffect(() => {
    api.get('/reports').then(({ data }) => {
      setRecent(data.reports.slice(0, 10));
      setMine(data.reports.filter((r) => r.supervisor_id === user.id).slice(0, 10));
    });
  }, [user.id]);

  const today = new Date().toLocaleDateString();

  return (
    <div className="page">
      <h2>Welcome, {user.name}</h2>
      <p className="muted">{today} — {user.role}</p>

      <div className="quick-actions">
        <Link className="button" to="/reports/new">Create Daily Report</Link>
        <Link className="button secondary" to="/reports">All Reports</Link>
      </div>

      {user.role === 'supervisor' && (
        <section className="card">
          <h3>My Reports</h3>
          <ReportTable reports={mine} />
        </section>
      )}

      <section className="card">
        <h3>Recent Reports</h3>
        <ReportTable reports={recent} />
      </section>
    </div>
  );
}

function ReportTable({ reports }) {
  if (!reports.length) return <p className="muted">No reports yet.</p>;
  return (
    <table className="data-table">
      <thead>
        <tr><th>Date</th><th>Shift</th><th>Supervisor</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.id}>
            <td>{r.report_date}</td>
            <td>{r.shift_name}</td>
            <td>{r.supervisor_name}</td>
            <td>{r.status}</td>
            <td><Link to={`/reports/${r.id}`}>View</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
