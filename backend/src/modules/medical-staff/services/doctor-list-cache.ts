import type { KeyValueStore } from '../../../common/stores/key-value-store.js';
import { listDoctors } from './medical-staff.service.js';

const prefix = 'hospital:doctor-list:v1';
const generationKey = `${prefix}:generation`;
const ttlSeconds = 60;
type Doctors = Awaited<ReturnType<typeof listDoctors>>;

export async function getCachedDoctors(
  store: KeyValueStore | undefined,
  departmentId: string,
  activeOnly?: boolean,
): Promise<Doctors> {
  if (!store) return listDoctors(departmentId, activeOnly);

  let key: string;
  try {
    const generation = (await store.get(generationKey)) ?? '0';
    key = `${prefix}:${generation}:${encodeURIComponent(departmentId)}:${activeOnly ? 'active' : 'all'}`;
    const cached = await store.get(key);
    if (cached !== null) return JSON.parse(cached) as Doctors;
  } catch {
    console.warn('[doctor-list-cache] read failed');
    return listDoctors(departmentId, activeOnly);
  }

  const doctors = await listDoctors(departmentId, activeOnly);
  // 임의의 진료과 ID로 보낸 요청은 캐시 키를 늘리지 않는다.
  if (doctors.length > 0) {
    try {
      await store.set(key, JSON.stringify(doctors), ttlSeconds);
    } catch {
      console.warn('[doctor-list-cache] write failed');
    }
  }
  return doctors;
}

export async function invalidateDoctorLists(store: KeyValueStore | undefined): Promise<void> {
  if (!store) return;
  try {
    // 변경 이전에 진행 중이던 조회는 이전 세대에만 값을 쓸 수 있다.
    await store.increment(generationKey);
  } catch {
    console.warn('[doctor-list-cache] invalidation failed');
  }
}
