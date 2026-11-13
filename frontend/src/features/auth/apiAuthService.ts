import { apiClient } from '../../services/api/client';
import { ApiError } from '../../services/api/errors';
import type { ApiResponse } from '../../types/api';
import { roles, type LoginRequest, type SelfAccount } from '../../types/auth';
import type { AuthService, InvitationInfo } from './authService';

/** Validate the authentication boundary; never trust an unchecked role assertion. */
export function parseSelfAccount(value: unknown): SelfAccount {
  const v = value as Partial<SelfAccount> | null;
  const d = v?.department;
  if (
    !v ||
    typeof v.id !== 'string' ||
    typeof v.name !== 'string' ||
    typeof v.email !== 'string' ||
    !roles.includes(v.role as SelfAccount['role']) ||
    v.status !== 'ACTIVE' ||
    !(
      d === null ||
      (d &&
        typeof d.id === 'string' &&
        typeof d.name === 'string' &&
        ['ACTIVE', 'INACTIVE'].includes(d.status))
    ) ||
    !(v.role === 'DOCTOR'
      ? typeof v.doctorId === 'string' && v.doctorId.length > 0
      : v.doctorId === null)
  ) {
    throw new ApiError(
      'INVALID_SESSION',
      '계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요.',
    );
  }
  return v as SelfAccount;
}

export const apiAuthService: AuthService = {
  loginIdentifier: 'email',
  async me(signal) {
    try {
      const { data } = await apiClient.get<ApiResponse<unknown>>('/auth/me', {
        signal,
      }); // AUTH_03
      return parseSelfAccount(data.data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  async login({ identifier, password }) {
    const input: LoginRequest = { email: identifier, password };
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/auth/login',
      input,
    ); // AUTH_01
    return parseSelfAccount(data.data);
  },
  async logout() {
    await apiClient.post('/auth/logout');
  }, // AUTH_02, 204
  async verifyInvitation(token, signal) {
    const { data } = await apiClient.post<ApiResponse<InvitationInfo>>(
      '/auth/invitations/verify',
      { token },
      { signal },
    ); // AUTH_04
    const info = data.data;
    if (
      !info ||
      typeof info.name !== 'string' ||
      typeof info.email !== 'string' ||
      !roles.includes(info.role) ||
      !(
        info.department === null ||
        (typeof info.department?.id === 'string' &&
          typeof info.department?.name === 'string')
      )
    ) {
      throw new ApiError('INVALID_RESPONSE', '초대 정보를 확인할 수 없습니다.');
    }
    return info;
  },
  async acceptInvitation(input) {
    await apiClient.post('/auth/invitations/accept', input); // AUTH_05, 201
  },
  async verifyPasswordReset(token, signal) {
    const { data } = await apiClient.post<ApiResponse<{ valid: true }>>(
      '/auth/password-resets/verify',
      { token },
      { signal },
    ); // AUTH_06
    if (data.data?.valid !== true)
      throw new ApiError(
        'RESET_LINK_INVALID',
        '재설정 링크를 사용할 수 없습니다.',
        410,
      );
  },
  async confirmPasswordReset(input) {
    await apiClient.post('/auth/password-resets/confirm', input); // AUTH_07, 204
  },
};
