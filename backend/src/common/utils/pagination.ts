import { AppError } from '../errors/index.js';

function positiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new AppError(400, 'VALIDATION_ERROR', '페이지 값은 양의 정수여야 합니다.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new AppError(400, 'VALIDATION_ERROR', '페이지 값이 너무 큽니다.');
  return parsed;
}

export function parsePage(query: { page?: unknown; size?: unknown }) {
  const page = positiveInteger(query.page, 1);
  const size = positiveInteger(query.size, 20);
  const skip = (page - 1) * size;
  if (!Number.isSafeInteger(skip)) throw new AppError(400, 'VALIDATION_ERROR', '페이지 범위가 너무 큽니다.');
  return { page, size, skip };
}

export function paginationMeta(page: number, size: number, totalItems: number) {
  return { page, size, totalItems, totalPages: Math.ceil(totalItems / size) };
}
