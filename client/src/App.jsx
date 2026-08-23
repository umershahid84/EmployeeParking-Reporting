import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import ReportsList from './pages/ReportsList';
import ReportForm from './pages/ReportForm';
import ReportView from './pages/ReportView';
import ManagerDashboard from './pages/ManagerDashboard';
import AdminHome from './pages/admin/AdminHome';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDrivers from './pages/admin/AdminDrivers';
import AdminShuttles from './pages/admin/AdminShuttles';
import AdminAuditLog from './pages/admin/AdminAuditLog';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/reports" element={<ReportsList />} />
          <Route path="/reports/new" element={<ReportForm />} />
          <Route path="/reports/:id" element={<ReportView />} />
          <Route path="/reports/:id/edit" element={<ReportForm />} />
          <Route path="/manager" element={<ProtectedRoute minRole="manager"><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute minRole="administrator"><AdminHome /></ProtectedRoute>}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="drivers" element={<AdminDrivers />} />
            <Route path="shuttles" element={<AdminShuttles />} />
            <Route path="audit" element={<AdminAuditLog />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
