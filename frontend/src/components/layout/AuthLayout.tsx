import { Outlet, useLocation } from 'react-router';
import { HospitalIdentity } from './HospitalIdentity';
import './layout.css';

export function AuthLayout() {
  const invitation = useLocation().pathname === '/invitations/accept';
  return (
    <div className="auth-layout">
      <a className="skip-link" href="#auth-content">
        본문으로 이동
      </a>
      <header className="auth-header">
        <HospitalIdentity subtitle />
      </header>
      <main
        id="auth-content"
        className={`auth-content${invitation ? ' auth-content--invitation' : ''}`}
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <footer className="auth-footer">
        병원 업무 시스템 · 허가된 사용자만 이용할 수 있습니다.
      </footer>
    </div>
  );
}
