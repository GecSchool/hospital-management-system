export type NursingCreate = { content: string };
export type NursingCorrection = NursingCreate & { baseVersionNo: number; correctionReason: string };
import { AppError } from '../../../common/errors/index.js';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError(400, 'VALIDATION_ERROR', '요청 본문이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}
// NUR-02: 접수에 기록할 내용의 형식을 확인한다.
export function parseNursingCreate(body: unknown): NursingCreate {
  const value = object(body);
  if (typeof value.content !== 'string' || !value.content.trim())
    throw new AppError(400, 'VALIDATION_ERROR', '기록 내용을 입력해 주세요.');
  return { content: value.content };
}
// NUR-05: 정정 내용·사유와 최신 버전을 확인하기 위한 기준 버전 번호를 검증한다.
export function parseNursingCorrection(body: unknown): NursingCorrection {
  const value = object(body),
    input = parseNursingCreate(body);
  if (
    typeof value.baseVersionNo !== 'number' ||
    !Number.isSafeInteger(value.baseVersionNo) ||
    value.baseVersionNo < 1 ||
    value.baseVersionNo > 2147483646
  )
    throw new AppError(400, 'VALIDATION_ERROR', '기준 버전 번호가 올바르지 않습니다.');
  if (typeof value.correctionReason !== 'string' || !value.correctionReason.trim())
    throw new AppError(400, 'VALIDATION_ERROR', '정정 사유가 필요합니다.');
  return { ...input, baseVersionNo: value.baseVersionNo, correctionReason: value.correctionReason };
}
// 접수/간호기록의 불투명 식별자를 검증한다.
export function parseNursingWriteId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new AppError(400, 'VALIDATION_ERROR', '식별자가 올바르지 않습니다.');
  return value;
}
