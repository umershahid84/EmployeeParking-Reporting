import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';

const emptyCallout = () => ({ shuttleId: '', driverId: '', notes: '' });
const emptyShiftFill = () => ({ shuttleId: '', driverId: '', coverageType: 'assigned', originalShuttleId: '', notes: '' });

export default function ReportForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [shifts, setShifts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shuttles, setShuttles] = useState([]);

  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftId, setShiftId] = useState('');
  const [busIssues, setBusIssues] = useState('');
  const [workOrders, setWorkOrders] = useState('');
  const [significantActivity, setSignificantActivity] = useState('');
  const [incomingSupervisor, setIncomingSupervisor] = useState('');
  const [notes, setNotes] = useState('');
  const [callouts, setCallouts] = useState([emptyCallout()]);
  const [shiftFills, setShiftFills] = useState([emptyShiftFill()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/shifts'),
      api.get('/drivers'),
      api.get('/shuttles'),
    ]).then(([s, d, sh]) => {
      setShifts(s.data.shifts);
      setDrivers(d.data.drivers);
      setShuttles(sh.data.shuttles);
    });
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/reports/${id}`).then(({ data }) => {
      const r = data.report;
      setReportDate(r.report_date);
      setShiftId(r.shift_id);
      setBusIssues(r.bus_issues || '');
      setWorkOrders(r.work_orders || '');
      setSignificantActivity(r.significant_activity || '');
      setIncomingSupervisor(r.incoming_supervisor || '');
      setNotes(r.notes || '');
      setCallouts(r.callouts.length ? r.callouts.map((c) => ({ shuttleId: c.shuttle_id || '', driverId: c.driver_id || '', notes: c.notes || '' })) : [emptyCallout()]);
      setShiftFills(r.shiftFills.length ? r.shiftFills.map((f) => ({
        shuttleId: f.shuttle_id || '', driverId: f.driver_id || '', coverageType: f.coverage_type,
        originalShuttleId: f.original_shuttle_id || '', notes: f.notes || '',
      })) : [emptyShiftFill()]);
    });
  }, [id, isEdit]);

  function updateRow(setter, index, key, value) {
    setter((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  async function handleSubmit(e, status) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const payload = {
      reportDate, shiftId, status,
      busIssues, workOrders, significantActivity, incomingSupervisor, notes,
      callouts: callouts.filter((c) => c.shuttleId || c.driverId || c.notes),
      shiftFills: shiftFills.filter((f) => f.shuttleId || f.driverId || f.notes),
    };
    try {
      if (isEdit) {
        await api.put(`/reports/${id}`, payload);
        navigate(`/reports/${id}`);
      } else {
        const { data } = await api.post('/reports', payload);
        navigate(`/reports/${data.report.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to save report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h2>{isEdit ? 'Edit Daily Report' : 'New Daily Report'}</h2>
      <form className="card report-form">
        <div className="form-row">
          <label>Report Date
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
          </label>
          <label>Shift
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
              <option value="">Select shift…</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>Driver Call-Outs</legend>
          {callouts.map((c, i) => (
            <div className="row-editor" key={i}>
              <select value={c.shuttleId} onChange={(e) => updateRow(setCallouts, i, 'shuttleId', e.target.value)}>
                <option value="">Shuttle #</option>
                {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
              </select>
              <select value={c.driverId} onChange={(e) => updateRow(setCallouts, i, 'driverId', e.target.value)}>
                <option value="">Driver</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
              </select>
              <input placeholder="Additional information" value={c.notes} onChange={(e) => updateRow(setCallouts, i, 'notes', e.target.value)} />
              <button type="button" onClick={() => setCallouts((rows) => rows.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setCallouts((rows) => [...rows, emptyCallout()])}>+ Add Call-Out</button>
        </fieldset>

        <fieldset>
          <legend>Driver Shift Fills</legend>
          {shiftFills.map((f, i) => (
            <div className="row-editor" key={i}>
              <select value={f.shuttleId} onChange={(e) => updateRow(setShiftFills, i, 'shuttleId', e.target.value)}>
                <option value="">Shuttle needing coverage</option>
                {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
              </select>
              <select value={f.driverId} onChange={(e) => updateRow(setShiftFills, i, 'driverId', e.target.value)}>
                <option value="">Driver filling shift</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
              </select>
              <select value={f.coverageType} onChange={(e) => updateRow(setShiftFills, i, 'coverageType', e.target.value)}>
                <option value="assigned">Already assigned</option>
                <option value="moved">Moved from another shuttle</option>
              </select>
              {f.coverageType === 'moved' && (
                <select value={f.originalShuttleId} onChange={(e) => updateRow(setShiftFills, i, 'originalShuttleId', e.target.value)}>
                  <option value="">Moved from shuttle #</option>
                  {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
                </select>
              )}
              <input placeholder="Notes" value={f.notes} onChange={(e) => updateRow(setShiftFills, i, 'notes', e.target.value)} />
              <button type="button" onClick={() => setShiftFills((rows) => rows.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setShiftFills((rows) => [...rows, emptyShiftFill()])}>+ Add Shift Fill</button>
        </fieldset>

        <label>Bus Issues / Problems Reported
          <textarea value={busIssues} onChange={(e) => setBusIssues(e.target.value)} rows={2} />
        </label>
        <label>Work Orders Placed
          <textarea value={workOrders} onChange={(e) => setWorkOrders(e.target.value)} rows={2} />
        </label>
        <label>Significant Shift Activity To Report
          <textarea value={significantActivity} onChange={(e) => setSignificantActivity(e.target.value)} rows={4} />
        </label>
        <label>Incoming Supervisor
          <input value={incomingSupervisor} onChange={(e) => setIncomingSupervisor(e.target.value)} />
        </label>
        <label>Other Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        {error && <div className="error-text">{error}</div>}

        <div className="form-actions">
          <button type="button" disabled={submitting} onClick={(e) => handleSubmit(e, 'draft')}>Save Draft</button>
          <button type="button" className="primary" disabled={submitting} onClick={(e) => handleSubmit(e, 'submitted')}>Submit Report</button>
        </div>
      </form>
    </div>
  );
}
