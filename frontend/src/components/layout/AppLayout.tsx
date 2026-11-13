import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../features/auth/useAuth';
import { roleLabels, type Role } from '../../types/auth';
import { HospitalIdentity } from './HospitalIdentity';
import { roleNavigation } from './navigation';
import './layout.css';

export function AppLayout({ role }: { role: Role }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#page-content">
        본문으로 이동
      </a>
      <aside className="app-sidebar" aria-label={`${roleLabels[role]} 메뉴`}>
        <div className="app-sidebar__identity">
          <HospitalIdentity />
        </div>
        <div className="app-sidebar__navigation">
          <p className="app-sidebar__label">병원 업무</p>
          <nav aria-label="주 메뉴">
            {roleNavigation[role].map((item) => {
              const isRelated =
                item.relatedPaths?.some(
                  (path) =>
                    pathname === path || pathname.startsWith(`${path}/`),
                ) ?? false;
              const isActive =
                isRelated ||
                pathname === item.to ||
                (!item.end && pathname.startsWith(`${item.to}/`));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`app-sidebar__link${isActive ? ' app-sidebar__link--active' : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="app-layout__main">
        <header className="app-header">
          {logoutError ? (
            <p className="app-header__error" role="alert">
              {logoutError}
            </p>
          ) : null}
          <p>
            {user?.name} <span aria-hidden="true">·</span> {roleLabels[role]}
          </p>
          <button
            type="button"
            className="app-header__logout"
            disabled={isLoggingOut}
            onClick={() => {
              void handleLogout();
            }}
          >
            {isLoggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </header>
        <main id="page-content" className="page-container" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function StaffLayout() {
  return <AppLayout role="STAFF" />;
}
export function DoctorLayout() {
  return <AppLayout role="DOCTOR" />;
}
export function NurseLayout() {
  return <AppLayout role="NURSE" />;
}
export function AdminLayout() {
  return <AppLayout role="ADMIN" />;
}
