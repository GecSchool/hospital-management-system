import { normalizeApiError } from '../../services/api/errors';
export function normalizeDate(value: string): string | undefined {
  const date = value.trim().replaceAll('.', '-');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const [, y, m, d] = match;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(y) &&
    parsed.getUTCMonth() + 1 === Number(m) &&
    parsed.getUTCDate() === Number(d)
    ? date
    : undefined;
}
// Basic display/input shape only. Server policy, checksum and identity verification remain unconfirmed.
export const validResidentShape = (value: string) =>
  /^\d{6}-?\d{7}$/.test(value);
export const validPhoneShape = (value: string) =>
  /^(?:\d{2,3}-\d{3,4}-\d{4}|\d{9,11})$/.test(value);
export function staffErrorMessage(reason: unknown): string {
  const error = normalizeApiError(reason);
  if (error.status === 404)
    return '환자 정보를 찾을 수 없습니다. 목록에서 다시 확인해 주세요.';
  if (error.status === 409)
    return '중복되거나 변경된 정보가 있습니다. 입력 내용을 확인해 주세요.';
  if (import.meta.env.DEV && error.code === 'MOCK_SYNTHETIC_ONLY')
    return '개발 Mock에서는 뒤 7자리가 0000000인 가상 번호만 사용해 주세요.';
  if (error.status === 400) return '입력 형식을 확인해 주세요.';
  return error.message;
}
