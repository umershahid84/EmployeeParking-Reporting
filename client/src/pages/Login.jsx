import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import Toggle from '../components/Toggle';

// Save Credentials is deliberately app-managed (localStorage), not left to
// the browser's own password-save prompt, since that's invisible/optional
// and depends on browser settings the user doesn't control. Checking the
// box remembers the email+password on this device so the form is
// pre-filled next time; unchecking it (or logging in with it off) clears
// whatever was saved. This trades some security for convenience - anyone
// with access to this browser profile can read the saved password back
// out of localStorage - which is an acceptable tradeoff for an internal,
// VPN-only tool but worth knowing.
const STORAGE_KEY = 'epr_saved_credentials';

function loadSavedCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Also opportunistically asks the browser's own OS-protected credential
// manager to save the login, for browsers that support it (Chrome/Edge).
// This is a bonus on top of the app-level save above, not a replacement -
// it never receives or stores the password itself.
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
  const saved = loadSavedCredentials();
  const [email, setEmail] = useState(saved?.email || '');
  const [password, setPassword] = useState(saved?.password || '');
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      if (saveCredentials) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
        await offerToSaveCredentials(email, password);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
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
        <Toggle checked={saveCredentials} onChange={setSaveCredentials} label="Save Credentials" />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
        <Link to="/forgot-password" className="link-muted">Forgot Password?</Link>
      </form>
    </AuthLayout>
  );
}
