import { Link } from 'react-router';
import { apiMode } from '../../services/mode';
import { useAuth } from './useAuth';
export function MockNotice() {
  if (!import.meta.env.DEV || apiMode !== 'mock') return null;
  return (
    <p className="mock-notice">
      개발용 Mock: 실제 계정 생성·비밀번호 변경·메일 발송은 이루어지지 않습니다.
    </p>
  );
}
export function MockAuthScenarios() {
  const { service } = useAuth();
  if (!import.meta.env.DEV || apiMode !== 'mock') return null;
  return (
    <aside className="mock-hint" aria-label="개발용 인증 안내">
      <strong>개발용 Mock 인증</strong>
      {service.developmentLogin && (
        <>
          <p>아이디: {service.developmentLogin.identifiers.join(' / ')}</p>
          <p>
            공통 비밀번호: {service.developmentLogin.password} · 실제 계정에
            사용하지 마세요.
          </p>
          <p>새로고침하면 로그아웃됩니다.</p>
        </>
      )}
      <details>
        <summary>개발용 오류 및 링크 시나리오</summary>
        {service.developmentLogin?.scenarios?.map((item) => (
          <p key={item.identifier}>
            {item.label}: {item.identifier} /{' '}
            {service.developmentLogin?.password}
          </p>
        ))}
        <ul>
          {service.developmentLinks?.map((item) => (
            <li key={`${item.kind}-${item.scenario}`}>
              <Link
                to={`${item.kind === 'invitation' ? '/invitations/accept' : '/password-reset'}?demo=${item.scenario}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <p>
          새 비밀번호는 저장하지 않습니다. 완료 후에도 테스트 로그인 비밀번호는
          동일합니다.
        </p>
      </details>
    </aside>
  );
}
