import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { normalizeApiError } from './errors';
import { staffErrorMessage } from '../../features/staff/validation';

function conflict(code: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('conflict', 'ERR_BAD_RESPONSE', config, undefined, {
    config,
    status: 409,
    statusText: 'Conflict',
    headers: {},
    data: { error: { code, message: '서버 메시지' } },
  });
}

describe('업무별 충돌 안내', () => {
  it.each([
    ['DEPARTMENT_NAME_DUPLICATE', '이미 등록된 진료과명입니다.'],
    [
      'DEPARTMENT_HAS_STAFF',
      '소속 의료진이 있는 진료과는 비활성화할 수 없습니다.',
    ],
    [
      'DEPARTMENT_IN_USE',
      '소속 의료진 또는 예약·접수 이력이 있는 진료과는 삭제할 수 없습니다.',
    ],
    ['DOCTOR_ON_LEAVE', '휴진일에는 해당 의사에게 현장 접수할 수 없습니다.'],
    ['LEAVE_HAS_WALK_IN', '현장 접수가 있는 날짜는 휴진할 수 없습니다.'],
  ])('%s 오류를 구체적으로 표시한다', (code, message) => {
    expect(normalizeApiError(conflict(code)).message).toBe(message);
  });
  it('주민등록번호 중복은 일반 충돌과 구분한다', () => {
    expect(staffErrorMessage(conflict('RESIDENT_NUMBER_DUPLICATE'))).toBe(
      '이미 등록된 주민등록번호입니다.',
    );
    expect(staffErrorMessage(conflict('OTHER'))).toContain(
      '중복되거나 변경된 정보',
    );
  });
});
