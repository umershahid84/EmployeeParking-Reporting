import { useState } from 'react';
import api from '../api/client';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to change password.');
    }
  }

  return (
    <div className="page">
      <h2>Change Password</h2>
      <form className="card" style={{ maxWidth: 420 }} onSubmit={handleSubmit}>
        <label>Current Password
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
        <label>New Password
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        </label>
        <label>Confirm New Password
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <div className="error-text">{error}</div>}
        {message && <div className="info-text">{message}</div>}
        <button type="submit">Update Password</button>
      </form>
    </div>
  );
}
