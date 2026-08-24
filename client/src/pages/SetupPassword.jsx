import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/setup-password', { uid, token, newPassword, confirmPassword });
      setMessage(data.message);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to set your password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!uid || !token) {
    return (
      <AuthLayout subtitle="Set Your Password">
        <p className="error-text">This link is missing required information. Please use the link from your account setup email.</p>
        <Link to="/login" className="link-muted">Back to Sign In</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Set Your Password">
      <form onSubmit={handleSubmit}>
        <p>Welcome to the Employee Parking Reporting System. Choose a password to finish setting up your account.</p>
        <label>New Password
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoFocus />
        </label>
        <label>Confirm Password
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <div className="error-text">{error}</div>}
        {message && <div className="info-text">{message}</div>}
        <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Set Password'}</button>
        <Link to="/login" className="link-muted">Back to Sign In</Link>
      </form>
    </AuthLayout>
  );
}
