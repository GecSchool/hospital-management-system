export interface ApiResponse<T, M = null> {
  data: T;
  meta: M;
}
export interface PageMeta {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
export interface CursorMeta {
  nextBefore: string | null;
  hasMore: boolean;
}
export interface ApiErrorResponse {
  error: { code: string; message: string; details: unknown; requestId: string };
}
