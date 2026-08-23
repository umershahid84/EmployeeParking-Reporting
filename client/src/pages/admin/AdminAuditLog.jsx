import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminAuditLog() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/audit', { params: { limit: 200 } }).then(({ data }) => setLogs(data.logs));
  }, []);

  return (
    <table className="data-table">
      <thead><tr><th>Date/Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.id}>
            <td>{new Date(l.created_at).toLocaleString()}</td>
            <td>{l.user_name || 'System'}</td>
            <td>{l.action}</td>
            <td>{l.entity ? `${l.entity} #${l.entity_id}` : '—'}</td>
            <td><code>{l.details ? JSON.stringify(JSON.parse(l.details)) : ''}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
