import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import SetupPassword from './pages/SetupPassword';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import ReportsList from './pages/ReportsList';
import ReportForm from './pages/ReportForm';
import ReportView from './pages/ReportView';
import ManagerDashboard from './pages/ManagerDashboard';
import Analytics from './pages/Analytics';
import AdminHome from './pages/admin/AdminHome';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDrivers from './pages/admin/AdminDrivers';
import AdminShuttles from './pages/admin/AdminShuttles';
import AdminEmailRecipients from './pages/admin/AdminEmailRecipients';
import AdminAuditLog from './pages/admin/AdminAuditLog';

// Daily Reports are a Supervisor function - Administrators are blocked
// server-side too (POST /api/reports requires the supervisor role exactly),
// this just keeps an Administrator from landing on the create form at all.
function ReportFormGuard() {
  const { user } = useAuth();
  if (user.role !== 'supervisor') return <Navigate to="/reports" replace />;
  return <ReportForm />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/setup-password" element={<SetupPassword />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/reports" element={<ReportsList />} />
          <Route path="/reports/new" element={<ReportFormGuard />} />
          <Route path="/reports/:id" element={<ReportView />} />
          <Route path="/reports/:id/edit" element={<ReportForm />} />
          <Route path="/manager" element={<ProtectedRoute minRole="manager"><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute minRole="manager"><Analytics /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute minRole="administrator"><AdminHome /></ProtectedRoute>}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="drivers" element={<AdminDrivers />} />
            <Route path="shuttles" element={<AdminShuttles />} />
            <Route path="email-notifications" element={<AdminEmailRecipients />} />
            <Route path="audit" element={<AdminAuditLog />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
