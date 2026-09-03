import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import api from '../api/client';
import { METRIC_COLORS, METRIC_LABELS, CHART_INK, LOCATION_COLORS } from '../charts/colors';
import { downloadFile } from '../utils/download';
import Logo from '../components/Logo';

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'last90', label: 'Last 90 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'prevMonth', label: 'Previous Month' },
  { value: 'custom', label: 'Custom Date Range' },
];

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function computeDateRange(preset, customFrom, customTo) {
  const today = new Date();
  switch (preset) {
    case 'today': return { from: fmt(today), to: fmt(today) };
    case 'yesterday': { const d = new Date(today); d.setDate(d.getDate() - 1); return { from: fmt(d), to: fmt(d) }; }
    case 'last7': { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmt(d), to: fmt(today) }; }
    case 'last30': { const d = new Date(today); d.setDate(d.getDate() - 29); return { from: fmt(d), to: fmt(today) }; }
    case 'last90': { const d = new Date(today); d.setDate(d.getDate() - 89); return { from: fmt(d), to: fmt(today) }; }
    case 'thisMonth': { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { from: fmt(d), to: fmt(today) }; }
    case 'prevMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case 'custom': return { from: customFrom, to: customTo };
    default: return { from: '', to: '' };
  }
}

function mergeByFixedLabels(labels, metricSeries) {
  return labels.map((label) => {
    const row = { label };
    for (const [metricKey, arr] of Object.entries(metricSeries)) {
      const match = arr.find((item) => item.label === label);
      row[metricKey] = match ? match.count : 0;
    }
    return row;
  });
}

function mergeByUnion(metricSeries, limit = 15) {
  const map = new Map();
  for (const [metricKey, arr] of Object.entries(metricSeries)) {
    for (const item of arr) {
      if (!map.has(item.label)) map.set(item.label, { label: item.label, id: item.id });
      map.get(item.label)[metricKey] = item.count;
    }
  }
  const rows = Array.from(map.values()).map((row) => {
    for (const metricKey of Object.keys(metricSeries)) {
      if (row[metricKey] === undefined) row[metricKey] = 0;
    }
    return row;
  });
  rows.sort((a, b) => {
    const totalA = Object.keys(metricSeries).reduce((sum, k) => sum + a[k], 0);
    const totalB = Object.keys(metricSeries).reduce((sum, k) => sum + b[k], 0);
    return totalB - totalA;
  });
  return rows.slice(0, limit);
}

export default function Analytics() {
  const navigate = useNavigate();

  const [shifts, setShifts] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shuttles, setShuttles] = useState([]);

  const [datePreset, setDatePreset] = useState('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [shiftIds, setShiftIds] = useState([]);
  const [supervisorIds, setSupervisorIds] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [shuttleId, setShuttleId] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/shifts'),
      api.get('/supervisors', { params: { includeInactive: '1' } }),
      api.get('/drivers', { params: { includeInactive: '1' } }),
      api.get('/shuttles', { params: { includeInactive: '1' } }),
    ]).then(([s, sup, d, sh]) => {
      setShifts(s.data.shifts);
      setSupervisors(sup.data.supervisors);
      setDrivers(d.data.drivers);
      setShuttles(sh.data.shuttles);
    });
  }, []);

  const { from, to } = useMemo(() => computeDateRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo]);

  useEffect(() => {
    if (datePreset === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    setError('');
    api.get('/analytics', {
      params: {
        dateFrom: from,
        dateTo: to,
        shiftIds: shiftIds.join(','),
        supervisorIds: supervisorIds.join(','),
        driverId: driverId || undefined,
        shuttleId: shuttleId || undefined,
      },
    })
      .then(({ data: payload }) => setData(payload))
      .catch((err) => setError(err.response?.data?.error || 'Unable to load analytics.'))
      .finally(() => setLoading(false));
  }, [from, to, shiftIds, supervisorIds, driverId, shuttleId, datePreset, customFrom, customTo]);

  function toggleId(setter, id) {
    setter((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function drillDown(extraParams) {
    const params = new URLSearchParams();
    if (from) params.set('dateFrom', from);
    if (to) params.set('dateTo', to);
    if (shiftIds.length === 1) params.set('shiftId', String(shiftIds[0]));
    if (supervisorIds.length === 1) params.set('supervisorId', String(supervisorIds[0]));
    if (driverId) params.set('driverId', driverId);
    if (shuttleId) params.set('shuttleId', shuttleId);
    Object.entries(extraParams || {}).forEach(([k, v]) => { if (v) params.set(k, v); });
    navigate(`/reports?${params.toString()}`);
  }

  function analyticsExportParams() {
    return {
      dateFrom: from || '',
      dateTo: to || '',
      shiftIds: shiftIds.join(','),
      supervisorIds: supervisorIds.join(','),
      driverId: driverId || undefined,
      shuttleId: shuttleId || undefined,
    };
  }

  async function exportCsv() {
    await downloadFile('/analytics/export.csv', analyticsExportParams(), 'analytics.csv');
  }

  async function exportPdf() {
    await downloadFile('/analytics/export.pdf', analyticsExportParams(), 'analytics.pdf');
  }

  const shiftNames = shifts.map((s) => s.name);

  return (
    <div className="page">
      <div className="print-header">
        <Logo />
        <div className="print-header-title">Employee Parking Analytics &amp; Trends — Port of Seattle</div>
      </div>

      <div className="page-header no-print">
        <h2>Analytics &amp; Trends</h2>
        <div className="row-actions">
          <button onClick={exportCsv}>Export CSV</button>
          <button onClick={exportPdf}>Export PDF</button>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <section className="card filters-card no-print">
        <div className="analytics-filter-row">
          <label>Date
            <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)}>
              {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          {datePreset === 'custom' && (
            <>
              <label>From <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label>To <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
            </>
          )}
          <label>Driver
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">All Drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
            </select>
          </label>
          <label>Shuttle/Bus
            <select value={shuttleId} onChange={(e) => setShuttleId(e.target.value)}>
              <option value="">All Shuttles</option>
              {shuttles.map((s) => <option key={s.id} value={s.id}>{s.shuttle_number}</option>)}
            </select>
          </label>
          <label>Shift
            <select
              value={shiftIds.length === 1 ? shiftIds[0] : ''}
              onChange={(e) => setShiftIds(e.target.value ? [Number(e.target.value)] : [])}
            >
              <option value="">All Shifts</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Supervisor
            <select
              value={supervisorIds.length === 1 ? supervisorIds[0] : ''}
              onChange={(e) => setSupervisorIds(e.target.value ? [Number(e.target.value)] : [])}
            >
              <option value="">All Supervisors</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{!s.is_active ? ' (inactive)' : ''}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="analytics-filter-row">
          <div>
            <span className="filter-group-label">Shift</span>
            <div className="checkbox-list">
              <label className="checkbox-item">
                <input type="checkbox" checked={shiftIds.length === 0} onChange={() => setShiftIds([])} /> All Shifts
              </label>
              {shifts.map((s) => (
                <label key={s.id} className="checkbox-item">
                  <input type="checkbox" checked={shiftIds.includes(s.id)} onChange={() => toggleId(setShiftIds, s.id)} /> {s.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="analytics-filter-row">
          <div>
            <span className="filter-group-label">Supervisor</span>
            <div className="checkbox-list">
              <label className="checkbox-item">
                <input type="checkbox" checked={supervisorIds.length === 0} onChange={() => setSupervisorIds([])} /> All Supervisors
              </label>
              {supervisors.map((s) => (
                <label key={s.id} className="checkbox-item">
                  <input type="checkbox" checked={supervisorIds.includes(s.id)} onChange={() => toggleId(setSupervisorIds, s.id)} />
                  {s.name}{!s.is_active ? ' (inactive)' : ''}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error && <div className="error-text">{error}</div>}
      {loading && <p className="muted">Loading analytics…</p>}

      {data && !loading && (
        <>
          <section>
            <h3>Overview</h3>
            <div className="stat-tile-row">
              <StatTile label="Total Reports" value={data.totals.reports} onClick={() => drillDown({})} />
              <StatTile label="Driver Call-Outs" value={data.totals.callouts} color={METRIC_COLORS.callouts} onClick={() => drillDown({})} />
              <StatTile label="OT Coverage" value={data.totals.otCoverage} color={METRIC_COLORS.ot} />
              <StatTile label="Driver Movements" value={data.totals.driverMovements} color={METRIC_COLORS.moved} />
              <StatTile label="Uncovered Shifts" value={data.totals.uncoveredShifts} color={METRIC_COLORS.uncovered} />
              <StatTile label="Work Orders" value={data.totals.workOrders} color={METRIC_COLORS.workOrders} />
            </div>
          </section>

          <section>
            <h3>Trends</h3>
            <div className="chart-grid">
              <TrendChart title="Driver Call-Out Trend" data={data.trend.callouts} color={METRIC_COLORS.callouts} onPointClick={(date) => drillDown({ date })} />
              <TrendChart title="OT Coverage Trend" data={data.trend.ot} color={METRIC_COLORS.ot} onPointClick={(date) => drillDown({ date })} />
              <TrendChart title="Driver Movement Trend" data={data.trend.moved} color={METRIC_COLORS.moved} onPointClick={(date) => drillDown({ date })} />
              <TrendChart title="Bus Issue Trend" data={data.trend.uncovered} color={METRIC_COLORS.uncovered} onPointClick={(date) => drillDown({ date })} />
              <TrendChart title="Work Order Trend" data={data.trend.workOrders} color={METRIC_COLORS.workOrders} onPointClick={(date) => drillDown({ date })} />
              <TrendChart title="Incoming Supervisor Handoffs" data={data.trend.incomingSupervisors} color={METRIC_COLORS.incomingSupervisors} onPointClick={(date) => drillDown({ date })} />
            </div>
          </section>

          <section>
            <h3>Comparisons</h3>

            <div className="card">
              <h4>By Shift</h4>
              <ComparisonBarChart
                data={mergeByFixedLabels(shiftNames, { callouts: data.byShift.callouts, ot: data.byShift.ot, moved: data.byShift.moved, uncovered: data.byShift.uncovered, workOrders: data.byShift.workOrders })}
                onBarClick={(label) => {
                  const shift = shifts.find((s) => s.name === label);
                  drillDown({ shiftId: shift ? String(shift.id) : undefined });
                }}
              />
            </div>

            <div className="card">
              <h4>By Supervisor</h4>
              <ComparisonBarChart
                data={mergeByUnion({ callouts: data.bySupervisor.callouts, ot: data.bySupervisor.ot, moved: data.bySupervisor.moved, uncovered: data.bySupervisor.uncovered, workOrders: data.bySupervisor.workOrders })}
                onBarClick={(label, row) => drillDown({ supervisorId: row?.id ? String(row.id) : undefined })}
              />
            </div>

            <div className="chart-grid">
              <SimpleBarChart title="Call-Outs by Shuttle/Bus" data={data.byShuttle.callouts} color={METRIC_COLORS.callouts} onBarClick={(label, row) => drillDown({ shuttleId: row?.id ? String(row.id) : undefined })} />
              <SimpleBarChart title="Call-Outs by Driver" data={data.byDriver.callouts} color={METRIC_COLORS.callouts} onBarClick={(label, row) => drillDown({ driverId: row?.id ? String(row.id) : undefined })} />
              <SimpleBarChart title="Most Frequently Moved Drivers" data={data.byDriver.mostMoved} color={METRIC_COLORS.moved} onBarClick={(label, row) => drillDown({ driverId: row?.id ? String(row.id) : undefined })} />
              <SimpleBarChart title="Shuttles Most Needing OT Coverage" data={data.byShuttle.ot} color={METRIC_COLORS.ot} onBarClick={(label, row) => drillDown({ shuttleId: row?.id ? String(row.id) : undefined })} />
              <SimpleBarChart title="Shuttles Most Moved To/From" data={data.byShuttle.moved} color={METRIC_COLORS.moved} onBarClick={(label, row) => drillDown({ shuttleId: row?.id ? String(row.id) : undefined })} />
              <SimpleBarChart title="Shuttles with Uncovered Shifts" data={data.byShuttle.uncovered} color={METRIC_COLORS.uncovered} onBarClick={(label, row) => drillDown({ shuttleId: row?.id ? String(row.id) : undefined })} />
            </div>

            <div className="card">
              <h4>Work Orders by Location</h4>
              <LocationPie data={data.byLocation.workOrders} />
            </div>

            <div className="card">
              <h4>Incoming Supervisor Handoffs</h4>
              <SimpleBarChart title="" data={data.incomingSupervisors} color={METRIC_COLORS.incomingSupervisors} onBarClick={(label, row) => drillDown({ supervisorId: row?.id ? String(row.id) : undefined })} />
            </div>
          </section>

          <section>
            <h3>Detailed Analysis</h3>
            <div className="card">
              <h4>Driver Movement Details</h4>
              <DetailTable
                rows={data.driverMovementDetails}
                columns={[
                  { key: 'report_date', label: 'Date' },
                  { key: 'shift_name', label: 'Shift' },
                  { key: 'supervisor_name', label: 'Supervisor' },
                  { key: 'driver_name', label: 'Driver' },
                  { key: 'original_shuttle_number', label: 'From Shuttle' },
                  { key: 'shuttle_number', label: 'To Shuttle' },
                  { key: 'notes', label: 'Comments' },
                ]}
              />
            </div>
            <div className="card">
              <h4>Bus Issue / Uncovered Shift Details</h4>
              <DetailTable
                rows={data.busIssueDetails}
                columns={[
                  { key: 'report_date', label: 'Date' },
                  { key: 'shift_name', label: 'Shift' },
                  { key: 'supervisor_name', label: 'Supervisor' },
                  { key: 'shuttle_number', label: 'Shuttle/Bus' },
                  { key: 'notes', label: 'Comments' },
                ]}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, color, onClick }) {
  return (
    <div className="stat-tile" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="stat-tile-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  );
}

function TrendChart({ title, data, color, onPointClick }) {
  return (
    <div className="card chart-card">
      <h4>{title}</h4>
      {(!data || data.length === 0) ? <p className="muted">No data for the selected filters.</p> : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} onClick={(e) => e?.activeLabel && onPointClick?.(e.activeLabel)}>
            <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_INK.muted }} stroke={CHART_INK.axis} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_INK.muted }} stroke={CHART_INK.axis} width={30} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke={color} strokeWidth={2} dot={{ r: 3, cursor: 'pointer' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ComparisonBarChart({ data, onBarClick }) {
  if (!data || data.length === 0) return <p className="muted">No data for the selected filters.</p>;
  const metrics = ['callouts', 'ot', 'moved', 'uncovered', 'workOrders'];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} onClick={(e) => e?.activePayload?.[0] && onBarClick?.(e.activeLabel, e.activePayload[0].payload)}>
        <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_INK.muted }} stroke={CHART_INK.axis} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_INK.muted }} stroke={CHART_INK.axis} width={30} />
        <Tooltip />
        <Legend formatter={(key) => METRIC_LABELS[key] || key} wrapperStyle={{ fontSize: 12 }} />
        {metrics.map((m) => (
          <Bar key={m} dataKey={m} name={m} fill={METRIC_COLORS[m]} radius={[3, 3, 0, 0]} cursor="pointer" />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function SimpleBarChart({ title, data, color, onBarClick }) {
  return (
    <div className="card chart-card">
      {title && <h4>{title}</h4>}
      {(!data || data.length === 0) ? <p className="muted">No data for the selected filters.</p> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 24 }} onClick={(e) => e?.activePayload?.[0] && onBarClick?.(e.activeLabel, e.activePayload[0].payload)}>
            <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: CHART_INK.muted }} stroke={CHART_INK.axis} />
            <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11, fill: CHART_INK.muted }} stroke={CHART_INK.axis} />
            <Tooltip />
            <Bar dataKey="count" fill={color} radius={[0, 3, 3, 0]} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function LocationPie({ data }) {
  if (!data || data.length === 0) return <p className="muted">No data for the selected filters.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={(entry) => `${entry.label}: ${entry.count}`}>
          {data.map((entry, i) => <Cell key={entry.label} fill={LOCATION_COLORS[i % LOCATION_COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DetailTable({ rows, columns }) {
  if (!rows || rows.length === 0) return <p className="muted">No matching records.</p>;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => <td key={c.key}>{r[c.key] ?? '—'}</td>)}
              <td><a href={`/reports/${r.report_id}`}>View Report</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
