import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('supervisor');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data.users);
  }
  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const { data } = await api.post('/users', { name, email, role });
      setMessage(data.temporaryPassword ? `User created. Temporary password: ${data.temporaryPassword}` : 'User created.');
      setName(''); setEmail(''); setRole('supervisor');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to create user.');
    }
  }

  async function toggleActive(u) {
    await api.put(`/users/${u.id}`, { isActive: !u.is_active });
    load();
  }

  async function changeRole(u, newRole) {
    await api.put(`/users/${u.id}`, { role: newRole });
    load();
  }

  async function resetAccount(u) {
    const { data } = await api.post(`/users/${u.id}/reset-account`);
    setMessage(`Temporary password for ${u.email}: ${data.temporaryPassword}`);
  }

  return (
    <div>
      <form className="card" onSubmit={createUser}>
        <h3>Create User</h3>
        <div className="form-row">
          <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="supervisor">Supervisor</option>
              <option value="manager">Manager</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        {message && <div className="info-text">{message}</div>}
        <button type="submit">Create User</button>
      </form>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                  <option value="administrator">Administrator</option>
                </select>
              </td>
              <td>{u.is_active ? 'Active' : 'Inactive'}</td>
              <td className="row-actions">
                <button onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                <button onClick={() => resetAccount(u)}>Reset Account</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
