import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { queryKeys } from '../../services/api/queryKeys';
import { getSessionGeneration } from '../../services/api/sessionGeneration';
import { normalizeApiError } from '../../services/api/errors';
/** Clinical payloads never enter MutationCache. Same account/doctor scope as clinical reads. */
export function useClinicalWrite() {
  const { user } = useAuth();
  const client = useQueryClient();
  const active = useRef(false);
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run<T>(work: () => Promise<T>, done: (result: T) => void) {
    if (lock.current || !user) return;
    lock.current = true;
    setPending(true);
    setError('');
    const generation = getSessionGeneration();
    const current = () =>
      active.current && generation === getSessionGeneration();
    try {
      const result = await work();
      if (!current()) return;
      const keys = [
        'doctor-clinical',
        'doctor-schedule',
        'staff-appointments',
        'staff-patients',
        'staff-dashboard',
      ].map((resource) => queryKeys.resource(user.id, resource));
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
        const failure = normalizeApiError(e);
        setConflict(failure.code === 'VERSION_CONFLICT');
        setError(
          failure.code === 'VERSION_CONFLICT'
            ? '최신 기록이 변경되었습니다. 초안은 유지됩니다. 최신 기록을 다시 조회하고 비교해 주세요.'
            : failure.code === 'SLOT_UNAVAILABLE'
              ? '선택한 시간은 더 이상 예약할 수 없습니다. 시간대를 다시 조회해 주세요.'
              : failure.message,
        );
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
    clear: () => {
      setConflict(false);
      setError('');
    },
  };
}
