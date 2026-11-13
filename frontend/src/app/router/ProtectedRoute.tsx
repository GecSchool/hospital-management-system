import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../features/auth/useAuth';
import { ErrorState, Loading } from '../../components/common';
import type { Role } from '../../types/auth';

export function ProtectedRoute({ roles }: { roles: readonly Role[] }) {
  const { user, status, error, retry } = useAuth();
  const location = useLocation();
  if (status === 'loading')
    return <Loading message="계정 정보를 확인하고 있습니다." />;
  if (status === 'error')
    return <ErrorState message={error ?? undefined} onRetry={retry} />;
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  if (!roles.includes(user.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
