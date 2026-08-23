import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
      setTimeout(() => navigate('/reset-password', { state: { email } }), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Forgot Password</h1>
        <p>Enter your account email address. If it matches an account, we'll send a 6-digit verification code.</p>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        {message && <div className="info-text">{message}</div>}
        <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Reset Code'}</button>
        <Link to="/login" className="link-muted">Back to Sign In</Link>
      </form>
    </div>
  );
}
