import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ReportView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get(`/reports/${id}`);
    setReport(data.report);
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    setError('');
    try {
      await api.post(`/reports/${id}/comments`, { comment });
      setComment('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to add comment.');
    }
  }

  if (!report) return <div className="page">Loading…</div>;

  const canComment = user.role === 'manager' || user.role === 'administrator';

  return (
    <div className="page">
      <div className="page-header">
        <h2>Daily Report — {report.report_date} ({report.shift_name})</h2>
        {report.canEdit && <Link className="button" to={`/reports/${report.id}/edit`}>Edit</Link>}
      </div>
      <p className="muted">Supervisor: {report.supervisor_name} · Status: {report.status} · Last modified {new Date(report.updated_at).toLocaleString()}</p>

      <section className="card">
        <h3>Driver Call-Outs</h3>
        {report.callouts.length === 0 && <p className="muted">None reported.</p>}
        {report.callouts.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Shuttle</th><th>Driver</th><th>Information</th></tr></thead>
            <tbody>
              {report.callouts.map((c) => (
                <tr key={c.id}><td>{c.shuttle_number || '—'}</td><td>{c.driver_name || '—'}</td><td>{c.notes || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Driver Shift Fills</h3>
        {report.shiftFills.length === 0 && <p className="muted">None reported.</p>}
        {report.shiftFills.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Shuttle</th><th>Driver</th><th>Coverage</th><th>Moved From</th><th>Notes</th></tr></thead>
            <tbody>
              {report.shiftFills.map((f) => (
                <tr key={f.id}>
                  <td>{f.shuttle_number || '—'}</td>
                  <td>{f.driver_name || '—'}</td>
                  <td>{f.coverage_type === 'moved' ? 'Moved from another shuttle' : 'Already assigned'}</td>
                  <td>{f.original_shuttle_number || '—'}</td>
                  <td>{f.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Shift Notes</h3>
        <p><strong>Bus Issues:</strong> {report.bus_issues || '—'}</p>
        <p><strong>Work Orders:</strong> {report.work_orders || '—'}</p>
        <p><strong>Significant Activity:</strong> {report.significant_activity || '—'}</p>
        <p><strong>Incoming Supervisor:</strong> {report.incoming_supervisor || '—'}</p>
        <p><strong>Other Notes:</strong> {report.notes || '—'}</p>
      </section>

      <section className="card">
        <h3>Manager / Admin Comments</h3>
        {report.comments.length === 0 && <p className="muted">No comments yet.</p>}
        <ul className="comment-list">
          {report.comments.map((c) => (
            <li key={c.id}>
              <p>{c.comment}</p>
              <span className="muted">{c.user_name} ({c.user_role}) — {new Date(c.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
        {canComment && (
          <form onSubmit={submitComment} className="comment-form">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Add a comment…" />
            {error && <div className="error-text">{error}</div>}
            <button type="submit">Save Comment</button>
          </form>
        )}
      </section>

      <section className="card">
        <h3>Report History</h3>
        <table className="data-table">
          <thead><tr><th>Date/Time</th><th>User</th><th>Change</th></tr></thead>
          <tbody>
            {report.history.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.created_at).toLocaleString()}</td>
                <td>{h.user_name}</td>
                <td>{h.action}{h.field_changed ? ` — ${h.field_changed}: "${h.previous_value ?? ''}" → "${h.new_value ?? ''}"` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
