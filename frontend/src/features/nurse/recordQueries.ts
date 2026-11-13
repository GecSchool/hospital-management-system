import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/api/queryKeys';
import { getSessionGeneration } from '../../services/api/sessionGeneration';
import { normalizeApiError } from '../../services/api/errors';
import { useAuth } from '../auth/useAuth';
export const recordKey = (id: string, departmentId?: string) =>
  [...queryKeys.resource(id, 'nursing-records'), departmentId] as const;
export function recordError(error: unknown) {
  const e = normalizeApiError(error);
  return e.code === 'VERSION_CONFLICT'
    ? '다른 정정이 저장되었습니다. 최신 기록을 다시 조회해 주세요. 작성 중인 내용은 유지됩니다.'
    : e.message;
}
/** Keep note payloads out of MutationCache; discard late results after session/unmount. */
export function useRecordWrite() {
  const { user } = useAuth();
  const client = useQueryClient();
  const mounted = useRef(false);
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(save: () => Promise<T>, done: (result: T) => void) {
    if (lock.current || !user) return;
    lock.current = true;
    setPending(true);
    setError('');
    const generation = getSessionGeneration();
    const current = () =>
      mounted.current && generation === getSessionGeneration();
    try {
      const result = await save();
      if (!current()) return;
      const keys = [
        recordKey(user.id, user.department?.id),
        queryKeys.resource(user.id, 'nurse-receptions'),
        queryKeys.resource(user.id, 'staff-receptions'),
      ];
      await Promise.all(
        keys.map((queryKey) => client.cancelQueries({ queryKey })),
      );
      if (!current()) return;
      await Promise.all(
        keys.map((queryKey) => client.invalidateQueries({ queryKey })),
      );
      if (current()) done(result);
    } catch (e) {
      if (current()) {
        setError(recordError(e));
        setConflict(normalizeApiError(e).code === 'VERSION_CONFLICT');
      }
    } finally {
      lock.current = false;
      if (current()) setPending(false);
    }
  }
  return {
    run,
    pending,
    error,
    conflict,
    clearConflict: () => {
      setConflict(false);
      setError('');
    },
  };
}
