import { AppError } from '../../../common/errors/index.js';
import { parseTime } from '../../../common/utils/time.js';
export type MinuteSlot = { dayOfWeek: number; startMinute: number; endMinute: number };

/** 같은 요일의 구간을 정렬하고 맞닿은 구간을 병합한다. 겹치면 오류다. */
export function normalizeSlots(slots: MinuteSlot[]): MinuteSlot[] {
  const sorted = slots
    .map((slot) => ({ ...slot }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
  const merged: MinuteSlot[] = [];
  for (const slot of sorted) {
    const prev = merged.at(-1);
    if (prev && prev.dayOfWeek === slot.dayOfWeek) {
      if (slot.startMinute < prev.endMinute)
        throw new AppError(400, 'VALIDATION_ERROR', '진료 가능 시간 구간이 겹칩니다.');
      if (slot.startMinute === prev.endMinute) {
        prev.endMinute = slot.endMinute;
        continue;
      }
    }
    merged.push(slot);
  }
  return merged;
}

/** SCH-02: body.weeklySlots를 확인하고 0~6 요일, 20분 경계·순서·겹침을 검증한다.
 * 결과는 요일/시작순, 맞닿은 구간을 합친 분 단위 배열이다. 빈 배열은 허용한다.
 * 잘못된 입력은 400 VALIDATION_ERROR. */
export function parseWeeklySlots(body: unknown): MinuteSlot[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !('weeklySlots' in body) ||
    !Array.isArray(body.weeklySlots)
  )
    throw new AppError(400, 'VALIDATION_ERROR', '주간 시간표 배열이 필요합니다.');
  return normalizeSlots(
    body.weeklySlots.map((value: unknown) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new AppError(400, 'VALIDATION_ERROR', '주간 시간 구간이 올바르지 않습니다.');
      const v = value as Record<string, unknown>;
      if (
        typeof v.dayOfWeek !== 'number' ||
        !Number.isInteger(v.dayOfWeek) ||
        v.dayOfWeek < 0 ||
        v.dayOfWeek > 6 ||
        typeof v.startTime !== 'string' ||
        typeof v.endTime !== 'string'
      )
        throw new AppError(400, 'VALIDATION_ERROR', '요일 또는 시각이 올바르지 않습니다.');
      const startMinute = parseTime(v.startTime),
        endMinute = parseTime(v.endTime, true);
      if (startMinute >= endMinute)
        throw new AppError(400, 'VALIDATION_ERROR', '종료 시각은 시작 시각보다 늦어야 합니다.');
      return { dayOfWeek: v.dayOfWeek, startMinute, endMinute };
    }),
  );
}
