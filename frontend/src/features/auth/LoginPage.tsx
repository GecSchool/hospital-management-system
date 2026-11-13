import { useRef, useState, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button, FormField, Input } from '../../components/ui';
import { ErrorState, Loading } from '../../components/common';
import { authErrorMessage } from './authMessages';
import { MockAuthScenarios, MockNotice } from './MockAuthScenarios';
import { roleHome } from '../../types/auth';
import { useAuth } from './useAuth';
import './auth.css';

export function LoginPage() {
  const {
    user,
    status,
    error: sessionError,
    login,
    loginIdentifier,
    retry,
  } = useAuth();
  const usesUsername = loginIdentifier === 'username';
  const location = useLocation();
  const submitting = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<{
    identifier?: string;
    password?: string;
  }>({});
  const notice: unknown = location.state?.authNotice;
  const description =
    notice === 'invitation-complete'
      ? '계정 설정이 완료되었습니다. 로그인해 주세요.'
      : notice === 'reset-complete'
        ? '비밀번호가 재설정되었습니다. 로그인해 주세요.'
        : '병원 계정으로 로그인해 주세요.';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading')
    return <Loading message="계정 정보를 확인하고 있습니다." />;
  if (user) {
    const from: unknown = location.state?.from;
    const prefix = `/${user.role.toLowerCase()}`;
    const destination =
      typeof from === 'string' &&
      (from === prefix || from.startsWith(`${prefix}/`))
        ? from
        : roleHome[user.role];
    return <Navigate to={destination} replace />;
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const input = event.currentTarget.elements.namedItem(
      usesUsername ? 'username' : 'email',
    ) as HTMLInputElement;
    const errors = {
      identifier: !identifier.trim()
        ? usesUsername
          ? '아이디를 입력해 주세요.'
          : '이메일을 입력해 주세요.'
        : !usesUsername && input.validity.typeMismatch
          ? '올바른 이메일 주소를 입력해 주세요.'
          : undefined,
      password: password ? undefined : '비밀번호를 입력해 주세요.',
    };
    setFieldErrors(errors);
    if (errors.identifier || errors.password) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await login({ identifier: identifier.trim(), password });
    } catch (reason) {
      setError(authErrorMessage(reason, usesUsername));
    } finally {
      submitting.current = false;
      setPending(false);
      setPassword('');
    }
  }

  return (
    <section
      className="login-page"
      aria-labelledby="login-title"
      data-figma-node={
        error?.startsWith('비활성')
          ? '37:3233'
          : error
            ? '37:3221'
            : notice === 'invitation-complete'
              ? '190:10555'
              : notice === 'reset-complete'
                ? '190:10584'
                : '8:9'
      }
    >
      <h1 id="login-title">로그인</h1>
      <p className="login-description">{description}</p>
      {location.state?.mock === true && <MockNotice />}
      {status === 'error' && (
        <ErrorState message={sessionError ?? undefined} onRetry={retry} />
      )}
      <form
        noValidate
        onSubmit={submit}
        className="login-form"
        aria-busy={pending}
      >
        <FormField
          id="identifier"
          label={usesUsername ? '아이디' : '이메일'}
          error={fieldErrors.identifier}
        >
          <Input
            id="identifier"
            name={usesUsername ? 'username' : 'email'}
            type={usesUsername ? 'text' : 'email'}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={
              usesUsername ? '아이디를 입력해 주세요' : '이메일을 입력해 주세요'
            }
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            disabled={pending}
          />
        </FormField>
        <FormField id="password" label="비밀번호" error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호를 입력해 주세요"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
        </FormField>
        <div className="login-actions">
          <div className="login-feedback">
            {(error || (status === 'anonymous' && sessionError)) && (
              <p className="login-error" role="alert">
                {error || sessionError}
              </p>
            )}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? '로그인 중…' : '로그인'}
          </Button>
        </div>
      </form>
      <aside className="login-help">
        <p>로그인에 문제가 있나요?</p>
        <p>계정 또는 비밀번호 재설정은 시스템 관리자에게 문의해 주세요.</p>
      </aside>
      <MockAuthScenarios />
    </section>
  );
}
