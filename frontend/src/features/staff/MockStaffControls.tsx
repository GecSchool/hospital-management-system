import { receptionKey } from '../receptions/queries';
import { bookingKey } from '../appointments/queries';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiMode } from '../../services/mode';
import { useAuth } from '../auth/useAuth';
import { staffKeys } from './queries';
import { useStaff } from './useStaff';
import type { MockStaffScenario } from './staffService';
export function MockStaffControls() {
  const { service } = useStaff();
  const { user } = useAuth();
  const client = useQueryClient();
  const [scenario, setScenario] = useState<MockStaffScenario>(
    () => service.development?.getScenario() ?? 'normal',
  );
  if (
    !import.meta.env.DEV ||
    apiMode !== 'mock' ||
    !service.development ||
    !user
  )
    return null;
  return (
    <aside className="staff-mock" aria-label="개발용 직원 화면 시나리오">
      <details>
        <summary>개발용 Mock · 모든 환자 정보는 가상 데이터입니다.</summary>
        <label htmlFor="staff-scenario">응답 시나리오</label>{' '}
        <select
          id="staff-scenario"
          value={scenario}
          onChange={(event) => {
            const value = event.target.value as MockStaffScenario;
            setScenario(value);
            service.development?.setScenario(value);
            void client.invalidateQueries({
              queryKey: receptionKey(user.id),
            });
            void client.invalidateQueries({ queryKey: bookingKey(user.id) });
            void client.invalidateQueries({
              queryKey: staffKeys.patients(user.id),
            });
            void client.invalidateQueries({
              queryKey: staffKeys.dashboard(user.id),
            });
          }}
        >
          <option value="normal">정상</option>
          <option value="empty">빈 목록</option>
          <option value="error">서버 오류</option>
          <option value="slow">느린 응답</option>
          <option value="save-error">등록·수정 실패</option>
        </select>
        <p>
          메모리에서만 유지하며 새로고침하면 초기화됩니다. 실제 개인정보를
          입력하지 마세요.
        </p>
      </details>
    </aside>
  );
}
