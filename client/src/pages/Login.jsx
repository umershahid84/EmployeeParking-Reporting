import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
        <Link to="/forgot-password" className="link-muted">Forgot Password?</Link>
      </form>
    </AuthLayout>
  );
}
