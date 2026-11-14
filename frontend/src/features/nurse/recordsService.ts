import { apiClient } from '../../services/api/client';
import type { ApiResponse } from '../../types/api';
import type { StaffAppointment } from '../staff/types';
export type RecordAuthor = StaffAppointment['registeredBy'];
export interface VersionSummary {
  versionNo: number;
  author: RecordAuthor;
  createdAt: string;
}
export interface NursingRecordVersion extends VersionSummary {
  recordId: string;
  content: string;
  correctionReason: string | null;
}
export interface NursingRecord {
  id: string;
  receptionId: string;
  receivedAt?: string;
  author: RecordAuthor;
  createdAt: string;
  latestVersion: NursingRecordVersion;
}
export type PatientNursingRecord = NursingRecord & { receivedAt: string };
export interface NursingRecordDetail {
  id: string;
  receptionId: string;
  latestVersion: NursingRecordVersion;
  versions: VersionSummary[];
}
export interface CursorMeta {
  nextBefore: string | null;
  hasMore: boolean;
}
export interface RecordPage<T extends NursingRecord = NursingRecord> {
  data: T[];
  meta: CursorMeta;
}
export interface RecordCursor {
  limit?: number;
  before?: string;
}
export interface RecordCorrection {
  baseVersionNo: number;
  content: string;
  correctionReason: string;
}
/** NUR_01–06. Authorization is enforced by the backend; mock binds a live principal. */
export interface NursingService {
  list(
    receptionId: string,
    cursor?: RecordCursor,
    signal?: AbortSignal,
  ): Promise<RecordPage>;
  create(
    receptionId: string,
    input: { content: string },
  ): Promise<NursingRecord>;
  detail(recordId: string, signal?: AbortSignal): Promise<NursingRecordDetail>;
  version(
    recordId: string,
    versionNo: number,
    signal?: AbortSignal,
  ): Promise<NursingRecordVersion>;
  correct(
    recordId: string,
    input: RecordCorrection,
  ): Promise<NursingRecordVersion>;
  history(
    patientId: string,
    receptionId: string,
    cursor?: RecordCursor,
    signal?: AbortSignal,
  ): Promise<RecordPage<PatientNursingRecord>>;
}
const recordPath = (id: string) => `/nursing-records/${encodeURIComponent(id)}`;
export const apiNursingService: NursingService = {
  async list(id, cursor, signal) {
    return (
      await apiClient.get<RecordPage>(
        `/receptions/${encodeURIComponent(id)}/nursing-records`,
        { params: cursor, signal },
      )
    ).data;
  },
  async create(id, input) {
    return (
      await apiClient.post<ApiResponse<NursingRecord>>(
        `/receptions/${encodeURIComponent(id)}/nursing-records`,
        { content: input.content },
      )
    ).data.data;
  },
  async detail(id, signal) {
    return (
      await apiClient.get<ApiResponse<NursingRecordDetail>>(recordPath(id), {
        signal,
      })
    ).data.data;
  },
  async version(id, versionNo, signal) {
    return (
      await apiClient.get<ApiResponse<NursingRecordVersion>>(
        `${recordPath(id)}/versions/${versionNo}`,
        { signal },
      )
    ).data.data;
  },
  async correct(id, input) {
    return (
      await apiClient.post<ApiResponse<NursingRecordVersion>>(
        `${recordPath(id)}/versions`,
        {
          baseVersionNo: input.baseVersionNo,
          content: input.content,
          correctionReason: input.correctionReason,
        },
      )
    ).data.data;
  },
  async history(patientId, receptionId, cursor, signal) {
    return (
      await apiClient.get<RecordPage<PatientNursingRecord>>(
        `/patients/${encodeURIComponent(patientId)}/nursing-records`,
        { params: { ...cursor, receptionId }, signal },
      )
    ).data;
  },
};
