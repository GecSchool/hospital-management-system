export type ClinicalFields = { symptoms: string; diagnosis: string; opinion: string };
export type CorrectionFields = ClinicalFields & { baseVersionNo: number; correctionReason: string };
import { AppError } from '../../../common/errors/index.js';
function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError(400, 'VALIDATION_ERROR', '요청 본문이 올바르지 않습니다.');
  return body as Record<string, unknown>;
}
// VIS-04: 필수 증상·진단·소견의 문자열 형태를 확인한다.
export function parseClinicalComplete(body: unknown): ClinicalFields {
  const value = object(body);
  if (
    typeof value.symptoms !== 'string' ||
    typeof value.diagnosis !== 'string' ||
    typeof value.opinion !== 'string'
  )
    throw new AppError(400, 'VALIDATION_ERROR', '증상·진단·소견은 문자열이어야 합니다.');
  return { symptoms: value.symptoms, diagnosis: value.diagnosis, opinion: value.opinion };
}
// VIS-07: 기준 버전 양의 정수와 증상·진단·소견 및 비어있지 않은 정정 사유를 확인한다.
export function parseClinicalCorrection(body: unknown): CorrectionFields {
  const value = object(body),
    fields = parseClinicalComplete(body);
  if (
    typeof value.baseVersionNo !== 'number' ||
    !Number.isSafeInteger(value.baseVersionNo) ||
    value.baseVersionNo < 1 ||
    value.baseVersionNo > 2147483646
  )
    throw new AppError(400, 'VALIDATION_ERROR', '기준 버전 번호가 올바르지 않습니다.');
  if (typeof value.correctionReason !== 'string' || !value.correctionReason.trim())
    throw new AppError(400, 'VALIDATION_ERROR', '정정 사유가 필요합니다.');
  return {
    ...fields,
    baseVersionNo: value.baseVersionNo,
    correctionReason: value.correctionReason,
  };
}
// 진료/진료기록의 불투명 식별자를 검증한다.
export function parseClinicalWriteId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim() || id.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '식별자가 올바르지 않습니다.');
  return id;
}
