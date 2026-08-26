import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

// Save Credentials asks the *browser's* built-in, OS-protected password
// manager to offer saving this login, via the standard Credential
// Management API - the app itself never stores the password anywhere
// (not in localStorage, not on the server beyond its normal hashed form).
// Supported by Chrome/Edge; browsers without support (Firefox, Safari)
// simply ignore the call and fall back to their own native save-password
// prompt, which the <form>/autoComplete attributes below already support.
async function offerToSaveCredentials(email, password) {
  if (!('credentials' in navigator) || typeof window.PasswordCredential !== 'function') return;
  try {
    const credential = new window.PasswordCredential({ id: email, password, name: email });
    await navigator.credentials.store(credential);
  } catch {
    // Best-effort only - never block login on this.
  }
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      if (saveCredentials) await offerToSaveCredentials(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout subtitle="Portal Login">
      <form onSubmit={handleSubmit}>
        <label>Email / Username
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="checkbox-item">
          <input type="checkbox" checked={saveCredentials} onChange={(e) => setSaveCredentials(e.target.checked)} />
          Save Credentials
        </label>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
        <Link to="/forgot-password" className="link-muted">Forgot Password?</Link>
      </form>
    </AuthLayout>
  );
}
