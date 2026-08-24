import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

const COVERAGE_LABELS = {
  ot: 'Shift Covered with OT',
  moved: 'Moved from Another Shuttle',
  not_covered: 'Shift Not Covered for Bus Issues',
};

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
      <div className="print-header">
        <Logo />
        <div className="print-header-title">Employee Parking Daily Report — Port of Seattle</div>
      </div>

      <div className="page-header no-print">
        <h2>Daily Report — {report.report_date} ({report.shift_name})</h2>
        <div className="row-actions">
          <button onClick={() => window.print()}>Print</button>
          {report.canEdit && <Link className="button" to={`/reports/${report.id}/edit`}>Edit</Link>}
        </div>
      </div>
      <h2 className="print-only-heading">Daily Report — {report.report_date} ({report.shift_name})</h2>
      <p className="muted">
        Supervisor: {report.supervisor_name} · Status: {report.status}
        {report.submitted_at ? <> · Submitted {new Date(report.submitted_at).toLocaleString()}</> : null}
        {' '}· Last edited {new Date(report.updated_at).toLocaleString()}
      </p>
      <p className="muted">
        Incoming Supervisor(s): {report.incomingSupervisors.length ? report.incomingSupervisors.map((s) => s.user_name).join(', ') : '—'}
      </p>

      <section className="card">
        <h3>Driver Call-Outs</h3>
        {report.callouts.length === 0 && <p className="muted">None reported.</p>}
        {report.callouts.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Shuttle/Bus #</th><th>Driver</th><th>Comments</th></tr></thead>
            <tbody>
              {report.callouts.map((c) => (
                <tr key={c.id}><td>{c.shuttle_number || '—'}</td><td>{c.driver_name || '—'}</td><td>{c.notes || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Shift Coverage</h3>
        {report.shiftCoverage.length === 0 && <p className="muted">None reported.</p>}
        {report.shiftCoverage.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Driver</th><th>Moved From / OT</th><th>Moved From Shuttle #</th><th>To Cover Shuttle/Bus #</th><th>Comments</th></tr></thead>
            <tbody>
              {report.shiftCoverage.map((c) => (
                <tr key={c.id}>
                  <td>{c.driver_name || '—'}</td>
                  <td>{COVERAGE_LABELS[c.coverage_type] || c.coverage_type}</td>
                  <td>{c.original_shuttle_number || '—'}</td>
                  <td>{c.shuttle_number || '—'}</td>
                  <td>{c.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Work Order Placed</h3>
        {report.workOrders.length === 0 && <p className="muted">None reported.</p>}
        {report.workOrders.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Location</th><th>Comments</th><th>Entered By</th><th>Date/Time</th></tr></thead>
            <tbody>
              {report.workOrders.map((w) => (
                <tr key={w.id}>
                  <td>{w.location}</td>
                  <td>{w.comments || '—'}</td>
                  <td>{w.user_name}</td>
                  <td>{new Date(w.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Shift Notes</h3>
        <p><strong>Bus Issues:</strong> {report.bus_issues || '—'}</p>
        <p><strong>Significant Activity:</strong> {report.significant_activity || '—'}</p>
        <p><strong>Additional Notes:</strong> {report.notes || '—'}</p>
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
          <form onSubmit={submitComment} className="comment-form no-print">
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
