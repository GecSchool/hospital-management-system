import { parseAccountId } from '../../account/validations/account-query.validation.js';
import { parseClinicalHistoryQuery } from '../../clinical-record/validations/clinical-history.validation.js';
/** 선택 접수 ID 필수, 양수 limit·불투명 before 커서를 검증한다. 오류는 400이다. */
export function parseNursingHistoryQuery(query: Record<string, unknown>) {
  return { receptionId: parseAccountId(query.receptionId), ...parseClinicalHistoryQuery(query) };
}
