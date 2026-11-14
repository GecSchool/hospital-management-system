import { parseAccountId } from '../../account/validations/account-query.validation.js';
/** 접수 ID의 문자열 형식·길이를 확인한다. 잘못되면 400이다. */
export function parseCallingReceptionId(value: unknown): string {
  return parseAccountId(value);
}
