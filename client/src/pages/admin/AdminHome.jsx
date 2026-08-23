import { Outlet, Link, useLocation } from 'react-router-dom';

export default function AdminHome() {
  const location = useLocation();
  const tabs = [
    { path: '/admin/users', label: 'Users' },
    { path: '/admin/drivers', label: 'Drivers' },
    { path: '/admin/shuttles', label: 'Shuttles' },
    { path: '/admin/audit', label: 'Audit Logs' },
  ];
  return (
    <div className="page">
      <h2>Administration</h2>
      <div className="tab-bar">
        {tabs.map((t) => (
          <Link key={t.path} to={t.path} className={location.pathname.startsWith(t.path) ? 'tab active' : 'tab'}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
