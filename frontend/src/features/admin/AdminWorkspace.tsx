import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import type { StaffService, MockStaffScenario } from '../staff/staffService';
import { staffService } from '../staff/service';
import { queryKeys } from '../../services/api/queryKeys';
import { getSessionGeneration } from '../../services/api/sessionGeneration';
import { normalizeApiError } from '../../services/api/errors';
import type { AccountFilters, AdminService } from './service';
import type { DepartmentService } from './departmentService';
import './admin.css';

const AdminContext = createContext<{
  service: AdminService;
  departments: DepartmentService;
  base: readonly string[];
  filters: AccountFilters;
  revision: number;
  search(filters: AccountFilters): void;
  source: StaffService;
} | null>(null);
export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error('AdminWorkspace is required');
  return value;
}
export function AdminWorkspace({
  source = staffService,
  children,
}: {
  source?: StaffService;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <AdminSession key={user!.id} source={source}>
      {children}
    </AdminSession>
  );
}
function AdminSession({
  source,
  children,
}: {
  source: StaffService;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const principal = useRef(user);
  principal.current = user;
  useEffect(() => {
    principal.current = user;
    return () => {
      principal.current = null;
    };
  }, [user]);
  const service = useMemo(
    () => source.admin(async () => principal.current),
    [source],
  );
  const departments = useMemo(
    () => source.departments(async () => principal.current),
    [source],
  );
  const [criteria, setCriteria] = useState({
    filters: {} as AccountFilters,
    revision: 0,
  });
  const base = queryKeys.resource(user!.id, 'admin');
  return (
    <AdminContext.Provider
      value={{
        service,
        departments,
        source,
        base,
        ...criteria,
        search: (filters) =>
          setCriteria((p) => ({ filters, revision: p.revision + 1 })),
      }}
    >
      <div className="admin-workspace">{children}</div>
    </AdminContext.Provider>
  );
}
export function adminError(reason: unknown) {
  const error = normalizeApiError(reason);
  return (
    (
      {
        LAST_ACTIVE_ADMIN: '마지막 활성 관리자 계정은 비활성화할 수 없습니다.',
        DOCTOR_HAS_PENDING_WORK:
          '처리되지 않은 예약·접수·진료가 있어 비활성화할 수 없습니다.',
        NOT_FOUND: '계정을 찾을 수 없습니다.',
      } as Record<string, string>
    )[error.code] ?? error.message
  );
}
export function useAdminWrite(wholeAccount = false) {
  const { base } = useAdmin();
  const prefix = wholeAccount ? base.slice(0, 2) : base;
  const client = useQueryClient();
  const active = useRef(false);
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run<T>(work: () => Promise<T>, done: (result: T) => void) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    setCode('');
    const generation = getSessionGeneration();
    const current = () =>
      active.current && generation === getSessionGeneration();
    try {
      const result = await work();
      if (!current()) return;
      await client.cancelQueries({ queryKey: prefix });
      if (!current()) return;
      await client.invalidateQueries({ queryKey: prefix });
      if (current()) done(result);
    } catch (reason) {
      if (current()) {
        setError(adminError(reason));
        setCode(normalizeApiError(reason).code);
      }
    } finally {
      locked.current = false;
      if (current()) setPending(false);
    }
  }
  return {
    run,
    pending,
    error,
    code,
    clear: () => {
      setError('');
      setCode('');
    },
  };
}
export function AdminMockControls() {
  const { source, service, base } = useAdmin();
  const client = useQueryClient();
  const [scenario, setScenario] = useState(
    source.development?.getScenario() ?? 'normal',
  );
  if (!import.meta.env.DEV || !service.mock || !source.development) return null;
  return (
    <aside className="admin-mock-controls">
      <p>
        개발용 Mock · 실제 이메일 발송 없음 · 새로고침 시 가상 데이터 초기화
      </p>
      <details>
        <summary>개발용 상태 시뮬레이션</summary>
        <label>
          관리자 Mock 상태
          <select
            value={scenario}
            onChange={(e) => {
              const next = e.target.value as MockStaffScenario;
              setScenario(next);
              source.development!.setScenario(next);
              void client.invalidateQueries({ queryKey: base });
            }}
          >
            <option value="normal">정상</option>
            <option value="slow">느린 응답</option>
            <option value="error">조회·요청 오류</option>
            <option value="save-error">저장 오류</option>
          </select>
        </label>
      </details>
    </aside>
  );
}
