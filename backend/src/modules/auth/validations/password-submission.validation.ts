// 초대 수락(AUTH-04~05)과 비밀번호 재설정(AUTH-06~07)이 함께 쓰는 토큰·비밀번호 입력 검사.
import { AppError } from '../../../common/errors/index.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth-policy.js';

function bodyOf(body: unknown): Record<string, unknown> {
  return (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
}

function tokenOf(input: Record<string, unknown>): string {
  if (typeof input.token !== 'string' || !input.token || input.token.length > 512)
    throw new AppError(400, 'VALIDATION_ERROR', '링크 정보가 올바르지 않습니다.', [
      { field: 'token', reason: 'INVALID' },
    ]);
  return input.token;
}

export function parseTokenBody(body: unknown): string {
  return tokenOf(bodyOf(body));
}

export const PASSWORD_RULE_MESSAGE = `비밀번호는 영문과 숫자를 모두 포함해 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`;

/**
 * 새 비밀번호가 규칙에 맞지 않는 이유를 돌려준다. 맞으면 null이다.
 * 초대 가입, 비밀번호 재설정, 관리자 생성 스크립트가 같은 규칙을 쓴다.
 * 로그인에는 적용하지 않는다. 이미 저장된 비밀번호로는 계속 로그인할 수 있어야 하기 때문이다.
 */
export function passwordRuleViolation(password: string): 'LENGTH' | 'COMPOSITION' | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
    return 'LENGTH';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'COMPOSITION';
  return null;
}

export function parsePasswordSubmission(body: unknown): { token: string; password: string } {
  const input = bodyOf(body);
  const token = tokenOf(input);
  const { password, passwordConfirm } = input;
  if (typeof password !== 'string' || typeof passwordConfirm !== 'string' || !password)
    throw new AppError(400, 'VALIDATION_ERROR', '비밀번호를 입력해 주세요.', [
      { field: 'password', reason: 'REQUIRED' },
    ]);
  if (password !== passwordConfirm)
    throw new AppError(422, 'PASSWORD_MISMATCH', '비밀번호가 일치하지 않습니다.');
  const violation = passwordRuleViolation(password);
  if (violation)
    throw new AppError(400, 'VALIDATION_ERROR', PASSWORD_RULE_MESSAGE, [
      { field: 'password', reason: violation },
    ]);
  return { token, password };
}
