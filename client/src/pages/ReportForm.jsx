import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import MultiSelectDropdown from '../components/MultiSelectDropdown';

const emptyCallout = () => ({ shuttleId: '', driverId: '', notes: '' });
const emptyCoverage = () => ({ coverageType: 'ot', shuttleId: '', driverId: '', originalShuttleId: '', notes: '' });
const emptyWorkOrder = () => ({ location: '', comments: '' });

const WORK_ORDER_LOCATIONS = ['LOT - A', 'LOT - C', 'North Employee Parking Lot'];

export default function ReportForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [shifts, setShifts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shuttles, setShuttles] = useState([]);
  const [supervisors, setSupervisors] = useState([]);

  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftId, setShiftId] = useState('');
  const [busIssues, setBusIssues] = useState('');
  const [significantActivity, setSignificantActivity] = useState('');
  const [notes, setNotes] = useState('');
  const [incomingSupervisorIds, setIncomingSupervisorIds] = useState([]);
  const [existingStatus, setExistingStatus] = useState(null);
  const [callouts, setCallouts] = useState([emptyCallout()]);
  const [shiftCoverage, setShiftCoverage] = useState([emptyCoverage()]);
  const [workOrders, setWorkOrders] = useState([emptyWorkOrder()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/shifts'),
      api.get('/drivers'),
      api.get('/shuttles'),
      api.get('/supervisors'),
    ]).then(([s, d, sh, sup]) => {
      setShifts(s.data.shifts);
      setDrivers(d.data.drivers);
      setShuttles(sh.data.shuttles);
      setSupervisors(sup.data.supervisors);
    });
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/reports/${id}`).then(({ data }) => {
      const r = data.report;
      setExistingStatus(r.status);
      setReportDate(r.report_date);
      setShiftId(r.shift_id);
      setBusIssues(r.bus_issues || '');
      setSignificantActivity(r.significant_activity || '');
      setNotes(r.notes || '');
      setIncomingSupervisorIds(r.incomingSupervisors.map((s) => String(s.user_id)));
      setCallouts(r.callouts.length ? r.callouts.map((c) => ({ shuttleId: c.shuttle_id || '', driverId: c.driver_id || '', notes: c.notes || '' })) : [emptyCallout()]);
      setShiftCoverage(r.shiftCoverage.length ? r.shiftCoverage.map((c) => ({
        coverageType: c.coverage_type, shuttleId: c.shuttle_id || '', driverId: c.driver_id || '',
        originalShuttleId: c.original_shuttle_id || '', notes: c.notes || '',
      })) : [emptyCoverage()]);
      setWorkOrders(r.workOrders.length ? r.workOrders.map((w) => ({ location: w.location, comments: w.comments || '' })) : [emptyWorkOrder()]);
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
      busIssues, significantActivity, notes,
      incomingSupervisorIds,
      callouts: callouts.filter((c) => c.shuttleId || c.driverId || c.notes),
      shiftCoverage: shiftCoverage.filter((c) => c.shuttleId || c.driverId || c.notes),
      workOrders: workOrders.filter((w) => w.location || w.comments),
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
          <label>Supervisor
            <input value={user.name} disabled />
          </label>
        </div>

        <fieldset>
          <legend>Incoming Supervisor(s)</legend>
          <MultiSelectDropdown
            options={supervisors.map((s) => ({ id: s.id, label: s.name }))}
            selectedIds={incomingSupervisorIds}
            onChange={setIncomingSupervisorIds}
            placeholder="Select incoming supervisor(s)…"
            emptyText="No active supervisor accounts found."
          />
        </fieldset>

        <fieldset>
          <legend>Driver Call-Outs</legend>
          {callouts.map((c, i) => (
            <div className="row-editor" key={i}>
              <select value={c.shuttleId} onChange={(e) => updateRow(setCallouts, i, 'shuttleId', e.target.value)}>
                <option value="">Shuttle/Bus #</option>
                {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
              </select>
              <select value={c.driverId} onChange={(e) => updateRow(setCallouts, i, 'driverId', e.target.value)}>
                <option value="">Driver</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
              </select>
              <input placeholder="Comments" value={c.notes} onChange={(e) => updateRow(setCallouts, i, 'notes', e.target.value)} />
              <button type="button" onClick={() => setCallouts((rows) => rows.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setCallouts((rows) => [...rows, emptyCallout()])}>+ Add Call-Out</button>
        </fieldset>

        <fieldset>
          <legend>Shift Coverage</legend>
          {shiftCoverage.map((c, i) => (
            <div className="row-editor coverage-row" key={i}>
              {c.coverageType !== 'not_covered' && (
                <select value={c.driverId} onChange={(e) => updateRow(setShiftCoverage, i, 'driverId', e.target.value)}>
                  <option value="">Driver</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
                </select>
              )}

              <select value={c.coverageType} onChange={(e) => updateRow(setShiftCoverage, i, 'coverageType', e.target.value)}>
                <option value="ot">Shift Covered with OT</option>
                <option value="moved">Moved from Another Shuttle</option>
                <option value="not_covered">Shift Not Covered for Bus Issues</option>
              </select>

              {c.coverageType === 'moved' && (
                <select value={c.originalShuttleId} onChange={(e) => updateRow(setShiftCoverage, i, 'originalShuttleId', e.target.value)}>
                  <option value="">Moved From: original shuttle #</option>
                  {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
                </select>
              )}

              <select value={c.shuttleId} onChange={(e) => updateRow(setShiftCoverage, i, 'shuttleId', e.target.value)}>
                <option value="">To Cover Shuttle/Bus #</option>
                {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
              </select>

              <input placeholder="Comments" value={c.notes} onChange={(e) => updateRow(setShiftCoverage, i, 'notes', e.target.value)} />
              <button type="button" onClick={() => setShiftCoverage((rows) => rows.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setShiftCoverage((rows) => [...rows, emptyCoverage()])}>+ Add Shift Coverage</button>
        </fieldset>

        <fieldset>
          <legend>Work Order Placed</legend>
          {workOrders.map((w, i) => (
            <div className="row-editor" key={i}>
              <select value={w.location} onChange={(e) => updateRow(setWorkOrders, i, 'location', e.target.value)}>
                <option value="">Location…</option>
                {WORK_ORDER_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
              </select>
              <input placeholder="Comments" value={w.comments} onChange={(e) => updateRow(setWorkOrders, i, 'comments', e.target.value)} />
              <button type="button" onClick={() => setWorkOrders((rows) => rows.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setWorkOrders((rows) => [...rows, emptyWorkOrder()])}>+ Add Work Order</button>
        </fieldset>

        <label>Bus Issues / Problems Reported
          <textarea value={busIssues} onChange={(e) => setBusIssues(e.target.value)} rows={2} />
        </label>
        <label>Significant Shift Activity To Report
          <textarea value={significantActivity} onChange={(e) => setSignificantActivity(e.target.value)} rows={4} />
        </label>
        <label>Additional Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        {error && <div className="error-text">{error}</div>}

        <div className="form-actions">
          {user.role === 'administrator' ? (
            // Administrators can correct an existing report but cannot submit
            // a Daily Report - the backend rejects that transition too.
            <button type="button" className="primary" disabled={submitting} onClick={(e) => handleSubmit(e, existingStatus === 'draft' ? 'draft' : 'submitted')}>Save Changes</button>
          ) : (
            <>
              <button type="button" disabled={submitting} onClick={(e) => handleSubmit(e, 'draft')}>Save Draft</button>
              <button type="button" className="primary" disabled={submitting} onClick={(e) => handleSubmit(e, 'submitted')}>Submit Report</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
