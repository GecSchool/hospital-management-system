// Match backend/src/modules/auth/validations/password-submission.validation.ts.
export const passwordRuleMessage =
  '비밀번호는 영문과 숫자를 모두 포함해 8~128자로 입력해 주세요.';

export function passwordFieldError(password: string): string | undefined {
  if (!password) return '비밀번호를 입력해 주세요.';
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    return passwordRuleMessage;
}
