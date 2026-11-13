import { ApiError } from '../api/errors';
import { mockTimestamp, mockRecordAuthor as author } from './utils';
import type { Principal } from '../../features/nurse/service';
import type {
  NursingService,
  NursingRecordVersion,
  RecordCursor,
} from '../../features/nurse/recordsService';
import type { SelfAccount } from '../../types/auth';
import type { StaffReception } from '../../features/staff/types';
/** DEVELOPMENT ONLY. Append-only synthetic notes linked to the existing reception repository.
 * No patient/reception copies, persistence, or real server transaction guarantee. */
export function createMockNursingRecords(source: {
  reception(id: string): StaffReception;
  markNursing(id: string): void;
  wait(signal?: AbortSignal, saving?: boolean): Promise<void>;
}) {
  const records = new Map<
    string,
    { receptionId: string; versions: NursingRecordVersion[] }
  >();
  let sequence = 0;
  const deny = () => {
    throw new ApiError(
      'FORBIDDEN',
      '이 간호 기록을 이용할 권한이 없습니다.',
      403,
    );
  };
  return (principal: Principal): NursingService => {
    async function authorize(write = false) {
      const u = await principal();
      if (
        !u ||
        u.status !== 'ACTIVE' ||
        (u.role !== 'NURSE' && (write || u.role !== 'DOCTOR'))
      )
        return deny();
      if (
        u.role === 'NURSE' &&
        (!u.department || u.department.status !== 'ACTIVE')
      )
        return deny();
      return u;
    }
    async function ready(
      signal?: AbortSignal,
      write = false,
      nurseOnly = false,
    ) {
      const before = await authorize(write);
      if (nurseOnly && before.role !== 'NURSE') return deny();
      const signature = (u: SelfAccount) =>
        `${u.id}:${u.role}:${u.department?.id}:${u.doctorId}`;
      const initial = signature(before);
      await source.wait(signal, write);
      const after = await authorize(write);
      if (initial !== signature(after)) return deny();
      return after;
    }
    function scoped(id: string, u: SelfAccount) {
      const r = source.reception(id);
      if (
        u.role === 'NURSE'
          ? r.department.id !== u.department!.id
          : r.doctor.id !== u.doctorId
      )
        return deny();
      return r;
    }
    function get(id: string, u: SelfAccount) {
      const record = records.get(id);
      if (!record)
        throw new ApiError('NOT_FOUND', '간호 기록을 찾을 수 없습니다.', 404);
      scoped(record.receptionId, u);
      return record;
    }
    function project(id: string) {
      const r = records.get(id)!;
      return structuredClone({
        id,
        receptionId: r.receptionId,
        receivedAt: source.reception(r.receptionId).receivedAt,
        author: r.versions[0].author,
        createdAt: r.versions[0].createdAt,
        latestVersion: r.versions.at(-1)!,
      });
    }
    function page(ids: string[], cursor: RecordCursor = {}) {
      ids = [...ids].sort(
        (a, b) =>
          Date.parse(records.get(a)!.versions[0].createdAt) -
          Date.parse(records.get(b)!.versions[0].createdAt),
      );
      const limit = cursor.limit ?? 10;
      if (!Number.isInteger(limit) || limit < 1)
        throw new ApiError(
          'VALIDATION_ERROR',
          '조회 개수를 확인해 주세요.',
          400,
        );
      const end = cursor.before ? ids.indexOf(cursor.before) : ids.length;
      if (end < 0)
        throw new ApiError(
          'VALIDATION_ERROR',
          '유효하지 않은 커서입니다.',
          400,
        );
      const start = Math.max(0, end - limit);
      return {
        data: ids.slice(start, end).map(project),
        meta: { hasMore: start > 0, nextBefore: start > 0 ? ids[start] : null },
      };
    }
    const nonempty = (value: string) =>
      typeof value === 'string' && !!value.trim();
    function version(
      id: string,
      versionNo: number,
      content: string,
      reason: string | null,
      u: SelfAccount,
    ): NursingRecordVersion {
      return {
        id: `${id}-v${versionNo}`,
        recordId: id,
        versionNo,
        content,
        correctionReason: reason,
        author: author(u),
        createdAt: mockTimestamp(),
      };
    }
    return {
      async list(id, cursor, signal) {
        const u = await ready(signal);
        scoped(id, u);
        return page(
          [...records]
            .filter(([, r]) => r.receptionId === id)
            .map(([key]) => key),
          cursor,
        );
      },
      async create(id, input) {
        const u = await ready(undefined, true);
        scoped(id, u);
        if (!nonempty(input.content))
          throw new ApiError(
            'VALIDATION_ERROR',
            '기록 내용을 입력해 주세요.',
            400,
          );
        const recordId = `demo-nursing-${++sequence}`;
        // Validation, append, and deletion guard share a synchronous critical section.
        source.markNursing(id);
        records.set(recordId, {
          receptionId: id,
          versions: [version(recordId, 1, input.content, null, u)],
        });
        return project(recordId);
      },
      async detail(id, signal) {
        const u = await ready(signal);
        const r = get(id, u);
        return structuredClone({
          id,
          receptionId: r.receptionId,
          latestVersion: r.versions.at(-1)!,
          versions: r.versions.map(({ id, versionNo, author, createdAt }) => ({
            id,
            versionNo,
            author,
            createdAt,
          })),
        });
      },
      async version(id, n, signal) {
        const u = await ready(signal);
        const r = get(id, u);
        const v = r.versions.find((v) => v.versionNo === n);
        if (!v)
          throw new ApiError('NOT_FOUND', '버전을 찾을 수 없습니다.', 404);
        return structuredClone(v);
      },
      async correct(id, input) {
        const u = await ready(undefined, true);
        const r = get(id, u);
        if (r.versions[0].author.id !== u.id) return deny();
        if (!nonempty(input.content) || !nonempty(input.correctionReason))
          throw new ApiError(
            'VALIDATION_ERROR',
            '정정 내용과 정정 사유를 입력해 주세요.',
            400,
          );
        if (!Number.isInteger(input.baseVersionNo) || input.baseVersionNo < 1)
          throw new ApiError(
            'VALIDATION_ERROR',
            '기준 버전을 확인해 주세요.',
            400,
          );
        if (input.baseVersionNo !== r.versions.at(-1)!.versionNo)
          throw new ApiError(
            'VERSION_CONFLICT',
            '최신 기록을 다시 조회한 후 정정해 주세요. 작성 중인 내용은 유지됩니다.',
            409,
          );
        const v = version(
          id,
          input.baseVersionNo + 1,
          input.content,
          input.correctionReason,
          u,
        );
        r.versions.push(v);
        return structuredClone(v);
      },
      async history(patientId, receptionId, cursor, signal) {
        const u = await ready(signal, false, true); // NUR_06 is NURSE-only.
        const selected = scoped(receptionId, u);
        if (selected.patient.id !== patientId)
          throw new ApiError(
            'VALIDATION_ERROR',
            '환자와 접수 정보를 확인해 주세요.',
            400,
          );
        const ids = [...records]
          .filter(([, record]) => {
            const r = source.reception(record.receptionId);
            return (
              r.patient.id === patientId && r.department.id === u.department!.id
            );
          })
          .map(([id]) => id);
        return page(ids, cursor);
      },
    };
  };
}
