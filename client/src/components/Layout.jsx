import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <Link to="/dashboard" className="brand">
          <Logo />
          <span>
            <div className="brand-title">Employee Parking Daily Reporting</div>
            <div className="brand-subtitle">Port of Seattle</div>
          </span>
        </Link>
        <nav>
          <Link to="/dashboard">Dashboard</Link>
          {user?.role === 'supervisor' && <Link to="/reports/new">New Daily Report</Link>}
          <Link to="/reports">All Reports</Link>
          {user?.role !== 'supervisor' && <Link to="/manager">Manager</Link>}
          {user?.role !== 'supervisor' && <Link to="/analytics">Analytics</Link>}
          {user?.role === 'administrator' && <Link to="/admin">Admin</Link>}
          <Link to="/change-password">Change Password</Link>
        </nav>
        <div className="user-info">
          <span>{user?.name} ({user?.role})</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
