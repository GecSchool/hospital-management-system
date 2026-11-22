import { normalizeApiError } from '../../services/api/errors';
import { passwordRuleMessage } from './passwordPolicy';
import type { AuthLinkKind } from './authService';

export function authErrorMessage(
  reason: unknown,
  usesUsername = false,
): string {
  const error = normalizeApiError(reason);
  if (error.code === 'ACCOUNT_INACTIVE')
    return '비활성 계정입니다. 시스템 관리자에게 문의해 주세요.';
  if (error.code === 'INVALID_CREDENTIALS' || error.status === 401)
    return usesUsername
      ? '아이디 또는 비밀번호가 올바르지 않습니다.'
      : '이메일 또는 비밀번호를 확인해 주세요.';
  if (error.status === 429)
    return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (error.code === 'PASSWORD_MISMATCH')
    return '비밀번호가 일치하지 않습니다.';
  if (error.code === 'ACCOUNT_EMAIL_DUPLICATE')
    return '이미 등록된 계정입니다. 시스템 관리자에게 문의해 주세요.';
  if (error.status && error.status >= 500)
    return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  return error.message;
}

export function authLinkErrorMessage(reason: unknown): string {
  const error = normalizeApiError(reason);
  if (error.status === 429)
    return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  return authErrorMessage(error);
}

export function passwordSubmissionErrorMessage(
  reason: unknown,
  kind: AuthLinkKind,
): string {
  const error = normalizeApiError(reason);
  if (error.status === 400 && error.code === 'VALIDATION_ERROR')
    return passwordRuleMessage;
  if (
    kind === 'invitation' &&
    error.status === 409 &&
    error.code === 'CONFLICT'
  )
    return '초대받은 진료과를 사용할 수 없습니다. 시스템 관리자에게 문의해 주세요.';
  return authLinkErrorMessage(error);
}
