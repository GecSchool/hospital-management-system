// AUTH-01 로그인 요청의 형식 검사.
import { AppError } from '../../../common/errors/index.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 이메일은 앞뒤 공백을 지우고 소문자로 바꿔 한 가지 형태로만 다룬다. */
export function parseEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email))
    throw new AppError(400, 'VALIDATION_ERROR', '이메일 형식이 올바르지 않습니다.', [
      { field: 'email', reason: 'INVALID' },
    ]);
  return email;
}

export function parseLoginBody(body: unknown): { email: string; password: string } {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const email = parseEmail(input.email);
  // 로그인에서는 길이 규칙을 알려 주지 않는다. 지나치게 긴 입력만 막는다.
  if (typeof input.password !== 'string' || !input.password || input.password.length > 1024)
    throw new AppError(400, 'VALIDATION_ERROR', '비밀번호를 입력해 주세요.', [
      { field: 'password', reason: 'REQUIRED' },
    ]);
  return { email, password: input.password };
}
