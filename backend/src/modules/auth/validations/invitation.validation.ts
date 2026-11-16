// ACC-03 초대 요청의 형식 검사. 토큰·비밀번호 입력은 password-submission.validation.ts에서 검사한다.
import { AppError } from '../../../common/errors/index.js';
import type { Role } from '../../../generated/prisma/client.js';
import { parseEmail } from './session.validation.js';

const roles: Role[] = ['STAFF', 'DOCTOR', 'NURSE', 'ADMIN'];
const NAME_MAX_LENGTH = 50;

export type InvitationRequest = {
  name: string;
  email: string;
  role: Role;
  /** 의사·간호사는 소속 진료과가 필수이고, 직원·관리자는 소속이 없다. */
  departmentId: string | null;
};

function invalid(message: string, field: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message, [{ field, reason: 'INVALID' }]);
}

export function parseInvitationRequest(body: unknown): InvitationRequest {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > NAME_MAX_LENGTH)
    throw invalid(`이름은 1자 이상 ${NAME_MAX_LENGTH}자 이하여야 합니다.`, 'name');
  const email = parseEmail(input.email);
  if (!roles.includes(input.role as Role)) throw invalid('역할 값이 올바르지 않습니다.', 'role');
  const role = input.role as Role;
  const departmentId = input.departmentId ?? null;
  if (role === 'DOCTOR' || role === 'NURSE') {
    if (typeof departmentId !== 'string' || !departmentId.trim() || departmentId.length > 256)
      throw invalid('의사·간호사는 소속 진료과를 선택해야 합니다.', 'departmentId');
    return { name, email, role, departmentId };
  }
  if (departmentId !== null)
    throw invalid('직원·관리자에게는 소속 진료과를 지정할 수 없습니다.', 'departmentId');
  return { name, email, role, departmentId: null };
}
