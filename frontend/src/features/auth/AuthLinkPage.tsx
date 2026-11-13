import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ErrorState, Loading } from '../../components/common';
import { Button } from '../../components/ui';
import { normalizeApiError } from '../../services/api/errors';
import { apiMode } from '../../services/mode';
import { roleLabels } from '../../types/auth';
import { authErrorMessage } from './authMessages';
import type { AuthLinkKind, InvitationInfo } from './authService';
import { MockAuthScenarios, MockNotice } from './MockAuthScenarios';
import { PasswordForm } from './PasswordForm';
import { useAuth } from './useAuth';
import './auth.css';
type LinkState =
  | { status: 'loading' }
  | { status: 'expired' }
  | { status: 'ready'; info?: InvitationInfo }
  | { status: 'error'; message: string };
export function AuthLinkPage({ kind }: { kind: AuthLinkKind }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { service, clearSession } = useAuth();
  const invitation = kind === 'invitation';
  // Ingress tokens stay in component memory; query/fragment are scrubbed as soon as the route mounts.
  const [token, setToken] = useState(() => {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const tokens = [...query.getAll('token'), ...fragment.getAll('token')];
    if (tokens.length) return tokens.length === 1 ? tokens[0] : '';
    return import.meta.env.DEV && apiMode === 'mock'
      ? (service.developmentToken?.(kind, query.get('demo') ?? '') ?? '')
      : '';
  });
  const [state, setState] = useState<LinkState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const tokens = [...query.getAll('token'), ...fragment.getAll('token')];
    if (!tokens.length) return;
    setToken(tokens.length === 1 ? tokens[0] : '');
    query.delete('token');
    fragment.delete('token');
    navigate(
      {
        pathname: location.pathname,
        search: query.size ? `?${query}` : '',
        hash: fragment.size ? `#${fragment}` : '',
      },
      { replace: true, state: null },
    );
  }, [location.pathname, location.search, location.hash, navigate]);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: token ? 'loading' : 'expired' });
    if (token) {
      const request = invitation
        ? service.verifyInvitation(token, controller.signal)
        : service.verifyPasswordReset(token, controller.signal);
      request
        .then((info) => {
          if (!controller.signal.aborted)
            setState({ status: 'ready', info: info || undefined });
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setState(
              normalizeApiError(reason).status === 410
                ? { status: 'expired' }
                : { status: 'error', message: authErrorMessage(reason) },
            );
        });
    }
    return () => controller.abort();
  }, [token, invitation, service, attempt]);
  const active = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    active.current = true;
    generation.current += 1;
    return () => {
      active.current = false;
    };
  }, [token]);
  async function complete(password: string, passwordConfirm: string) {
    const current = generation.current;
    try {
      const input = { token, password, passwordConfirm };
      if (invitation) await service.acceptInvitation(input);
      else await service.confirmPasswordReset(input);
      if (!active.current || current !== generation.current) return;
      clearSession();
      setToken('');
      navigate('/login', {
        replace: true,
        state: {
          authNotice: invitation ? 'invitation-complete' : 'reset-complete',
          mock: import.meta.env.DEV && apiMode === 'mock',
        },
      });
    } catch (reason) {
      if (!active.current || current !== generation.current) return;
      if (normalizeApiError(reason).status === 410) {
        setToken('');
        setState({ status: 'expired' });
      } else throw reason;
    }
  }
  if (state.status === 'loading')
    return <Loading message="링크를 확인하고 있습니다." />;
  if (state.status === 'error')
    return (
      <section className="auth-page">
        <ErrorState
          message={state.message}
          onRetry={() => setAttempt((value) => value + 1)}
        />
        <Link className="auth-login-link" to="/login">
          로그인으로 돌아가기
        </Link>
        <MockAuthScenarios />
      </section>
    );
  if (state.status === 'expired')
    return (
      <section
        className="auth-page auth-link-expired"
        data-figma-node={invitation ? '8:82' : '8:93'}
      >
        <h1>{invitation ? '초대' : '재설정'} 링크를 사용할 수 없어요</h1>
        <p className="auth-expired-description">
          링크가 만료되었거나 이미 사용되었습니다.
          <br />
          시스템 관리자에게 {invitation ? '새 초대를' : '새 링크를'} 요청해
          주세요.
        </p>
        <Button onClick={() => navigate('/login')}>로그인으로 돌아가기</Button>
        <MockAuthScenarios />
      </section>
    );
  const info = state.info;
  return (
    <section
      className="auth-page"
      data-figma-node={
        invitation ? (info?.role === 'ADMIN' ? '239:19299' : '8:31') : '8:62'
      }
      aria-labelledby="auth-link-title"
    >
      <h1 id="auth-link-title">
        {invitation ? '계정 설정' : '비밀번호 재설정'}
      </h1>
      <p className="login-description">
        {invitation
          ? '초대 정보를 확인하고 사용할 비밀번호를 설정해 주세요.'
          : '새로운 비밀번호를 입력해 주세요.'}
      </p>
      {invitation && info && (
        <section
          className="invitation-info"
          aria-labelledby="invitation-info-title"
        >
          <h2 id="invitation-info-title">초대 정보</h2>
          <dl>
            <div>
              <dt>이름</dt>
              <dd>{info.name}</dd>
            </div>
            <div>
              <dt>역할</dt>
              <dd>{roleLabels[info.role]}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{info.email}</dd>
            </div>
            {info.role !== 'ADMIN' && (
              <div>
                <dt>소속 진료과</dt>
                <dd>{info.department?.name ?? '—'}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
      <PasswordForm key={token} kind={kind} onSubmit={complete} />
      <Link className="auth-login-link" to="/login">
        {invitation
          ? '이미 계정이 있나요? 로그인으로 이동'
          : '로그인으로 돌아가기'}
      </Link>
      <MockNotice />
      <MockAuthScenarios />
    </section>
  );
}
