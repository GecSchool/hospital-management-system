import { useRef, useState, type SubmitEvent } from 'react';
import { Button, FormField, Input } from '../../components/ui';
import { authErrorMessage } from './authMessages';
import type { AuthLinkKind } from './authService';
export function PasswordForm({
  kind,
  onSubmit,
}: {
  kind: AuthLinkKind;
  onSubmit: (password: string, passwordConfirm: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{
    password?: string;
    confirmation?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const invitation = kind === 'invitation';
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const next = {
      password: password ? undefined : '비밀번호를 입력해 주세요.',
      confirmation: !confirmation
        ? '비밀번호를 다시 입력해 주세요.'
        : password !== confirmation
          ? '비밀번호가 일치하지 않습니다.'
          : undefined,
    };
    setErrors(next);
    setError(null);
    if (next.password || next.confirmation) return;
    submitting.current = true;
    setPending(true);
    try {
      await onSubmit(password, confirmation);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      submitting.current = false;
      setPending(false);
      setPassword('');
      setConfirmation('');
    }
  }
  return (
    <form
      noValidate
      className={`password-form password-form--${kind}`}
      onSubmit={submit}
      aria-busy={pending}
    >
      <FormField
        id="new-password"
        label={invitation ? '비밀번호' : '새 비밀번호'}
        error={errors.password}
      >
        <Input
          id="new-password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          placeholder="비밀번호를 입력해 주세요"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
      </FormField>
      <FormField
        id="password-confirm"
        label={invitation ? '비밀번호 확인' : '새 비밀번호 확인'}
        error={errors.confirmation}
      >
        <Input
          id="password-confirm"
          type="password"
          name="passwordConfirm"
          autoComplete="new-password"
          required
          placeholder="비밀번호를 다시 입력해 주세요"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={pending}
        />
      </FormField>
      {error && (
        <p role="alert" className="login-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? '처리 중…' : invitation ? '가입 완료' : '비밀번호 재설정'}
      </Button>
    </form>
  );
}
