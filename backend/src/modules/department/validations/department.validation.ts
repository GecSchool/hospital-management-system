// DEP-01~05 진료과 관리의 입력 형식 검사.
import { AppError } from '../../../common/errors/index.js';
import type { DepartmentStatus } from '../../../generated/prisma/client.js';

export { parseDepartmentId } from '../../medical-staff/validations/medical-staff.validation.js';

const statuses: DepartmentStatus[] = ['ACTIVE', 'INACTIVE'];
const NAME_MAX_LENGTH = 50;

function bodyOf(body: unknown): Record<string, unknown> {
  return (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
}

/** 목록 조회의 status 조건. 생략하면 조건 없이 조회한다. */
export function parseDepartmentListQuery(query: Record<string, unknown>): {
  status?: DepartmentStatus;
} {
  if (query.status === undefined || query.status === '') return {};
  if (!statuses.includes(query.status as DepartmentStatus))
    throw new AppError(400, 'VALIDATION_ERROR', 'status 값이 올바르지 않습니다.');
  return { status: query.status as DepartmentStatus };
}

/** 진료과 이름은 앞뒤 공백을 지운 뒤 1~50자여야 한다. */
export function parseDepartmentName(body: unknown): string {
  const { name } = bodyOf(body);
  const text = typeof name === 'string' ? name.trim() : '';
  if (!text || text.length > NAME_MAX_LENGTH)
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `진료과 이름은 1자 이상 ${NAME_MAX_LENGTH}자 이하여야 합니다.`,
      [{ field: 'name', reason: 'INVALID' }],
    );
  return text;
}

export function parseDepartmentStatus(body: unknown): DepartmentStatus {
  const { status } = bodyOf(body);
  if (!statuses.includes(status as DepartmentStatus))
    throw new AppError(400, 'VALIDATION_ERROR', '진료과 상태 값이 올바르지 않습니다.', [
      { field: 'status', reason: 'INVALID' },
    ]);
  return status as DepartmentStatus;
}
