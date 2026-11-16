import { describe, expect, it } from 'vitest';
import { AppError } from '../../../common/errors/index.js';
import { parseInvitationRequest } from './invitation.validation.js';
import {
  parsePasswordSubmission,
  parseTokenBody,
  passwordRuleViolation,
} from './password-submission.validation.js';
import { parseEmail, parseLoginBody } from './session.validation.js';

function errorOf(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
  }
  throw new Error('AppError가 발생하지 않았습니다.');
}

describe('인증 입력 검사', () => {
  it('이메일을 소문자로 통일하고 형식이 틀리면 거부한다', () => {
    expect(parseEmail('  Doctor@Example.TEST ')).toBe('doctor@example.test');
    for (const value of ['', 'a', 'a@b', 'a b@c.d', '@c.d', 1, null, `${'a'.repeat(250)}@b.cd`])
      expect(errorOf(() => parseEmail(value)).status).toBe(400);
  });

  it('로그인 본문에서 비밀번호는 바꾸지 않고 그대로 전달한다', () => {
    expect(parseLoginBody({ email: 'A@B.cd', password: '  pass word  ' })).toEqual({
      email: 'a@b.cd',
      password: '  pass word  ',
    });
    expect(errorOf(() => parseLoginBody(null)).code).toBe('VALIDATION_ERROR');
    expect(
      errorOf(() => parseLoginBody({ email: 'a@b.cd', password: 'a'.repeat(1025) })).status,
    ).toBe(400);
  });

  it('새 비밀번호는 영문과 숫자를 모두 포함한 8~128자여야 한다', () => {
    for (const password of [
      'abcd1234',
      'Hospital2026',
      'a1b2c3d4',
      'pass word 1!',
      `a1${'b'.repeat(126)}`,
    ])
      expect(passwordRuleViolation(password)).toBeNull();
    for (const password of ['abc1234', '', `a1${'b'.repeat(127)}`])
      expect(passwordRuleViolation(password)).toBe('LENGTH');
    // 숫자만, 영문만, 특수문자만, 한글과 숫자(한글은 영문으로 치지 않는다)
    for (const password of ['12345678', 'abcdefgh', '!@#$%^&*', '비밀번호12345678'])
      expect(passwordRuleViolation(password)).toBe('COMPOSITION');
  });

  it('비밀번호 제출은 불일치를 422로, 규칙 위반을 400과 안내 문구로 구분한다', () => {
    const base = { token: 'token' };
    expect(
      parsePasswordSubmission({ ...base, password: 'abcd1234', passwordConfirm: 'abcd1234' }),
    ).toEqual({ token: 'token', password: 'abcd1234' });
    const mismatch = errorOf(() =>
      parsePasswordSubmission({ ...base, password: 'abcd1234', passwordConfirm: 'abcd1235' }),
    );
    expect([mismatch.status, mismatch.code]).toEqual([422, 'PASSWORD_MISMATCH']);
    for (const [password, reason] of [
      ['abc1234', 'LENGTH'],
      ['12345678', 'COMPOSITION'],
      ['abcdefgh', 'COMPOSITION'],
    ]) {
      const error = errorOf(() =>
        parsePasswordSubmission({ ...base, password, passwordConfirm: password }),
      );
      expect([error.status, error.code]).toEqual([400, 'VALIDATION_ERROR']);
      expect(error.message).toBe(
        '비밀번호는 영문과 숫자를 모두 포함해 8자 이상으로 입력해 주세요.',
      );
      expect(error.details).toEqual([{ field: 'password', reason }]);
    }
    expect(errorOf(() => parsePasswordSubmission({ ...base, password: 'abcd1234' })).status).toBe(
      400,
    );
    expect(
      errorOf(() => parsePasswordSubmission({ password: 'abcd1234', passwordConfirm: 'abcd1234' }))
        .status,
    ).toBe(400);
  });

  it('토큰은 비어 있지 않은 문자열이어야 한다', () => {
    expect(parseTokenBody({ token: 'abc' })).toBe('abc');
    for (const body of [undefined, {}, { token: '' }, { token: 1 }, { token: 'a'.repeat(513) }])
      expect(errorOf(() => parseTokenBody(body)).status).toBe(400);
  });

  it('초대 요청은 역할에 따라 소속 진료과를 요구하거나 금지한다', () => {
    expect(
      parseInvitationRequest({
        name: ' 홍길동 ',
        email: 'A@b.cd',
        role: 'NURSE',
        departmentId: 'd1',
      }),
    ).toEqual({ name: '홍길동', email: 'a@b.cd', role: 'NURSE', departmentId: 'd1' });
    expect(
      parseInvitationRequest({
        name: '홍길동',
        email: 'a@b.cd',
        role: 'STAFF',
        departmentId: null,
      }),
    ).toEqual({ name: '홍길동', email: 'a@b.cd', role: 'STAFF', departmentId: null });
    expect(
      parseInvitationRequest({ name: '홍길동', email: 'a@b.cd', role: 'ADMIN' }).departmentId,
    ).toBeNull();
    const invalid = [
      { name: '홍길동', email: 'a@b.cd', role: 'DOCTOR' },
      { name: '홍길동', email: 'a@b.cd', role: 'DOCTOR', departmentId: 1 },
      { name: '홍길동', email: 'a@b.cd', role: 'STAFF', departmentId: 'd1' },
      { name: '홍길동', email: 'a@b.cd', role: 'OWNER' },
      { name: ' ', email: 'a@b.cd', role: 'STAFF' },
    ];
    for (const body of invalid)
      expect(errorOf(() => parseInvitationRequest(body)).status).toBe(400);
  });
});
