import Logo from './Logo';

// Shared chrome for every auth page (login, forgot/reset password, account
// setup): a full-width header bar with the logo pinned top-left, a large
// page title, a page-specific subtitle, and a centered card for the form.
export default function AuthLayout({ subtitle, children }) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Logo className="brand-logo" placeholderClassName="brand-logo-placeholder" />
      </header>
      <div className="auth-hero">
        <h1 className="auth-hero-title">Employee Parking Daily Reporting</h1>
        {subtitle && <h2 className="auth-hero-subtitle">{subtitle}</h2>}
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
