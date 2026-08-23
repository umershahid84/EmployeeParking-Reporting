import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_RANK = { supervisor: 1, manager: 2, administrator: 3 };

export default function ProtectedRoute({ children, minRole }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (minRole && ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
