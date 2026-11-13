import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiAuthService,
  parseSelfAccount,
} from '../../features/auth/apiAuthService';
import { resolveApiMode } from '../mode';
import { apiClient, onSessionExpired } from './client';
import { ApiError } from './errors';
import { advanceSessionGeneration } from './sessionGeneration';

const account = {
  id: 'test-staff',
  name: '테스트 직원',
  email: 'staff@example.test',
  role: 'STAFF',
  status: 'ACTIVE',
  department: null,
  doctorId: null,
};
const originalAdapter = apiClient.defaults.adapter;
const subscriptions: Array<() => void> = [];

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  advanceSessionGeneration();
});

function response(
  config: InternalAxiosRequestConfig,
  status: number,
  data?: unknown,
): AxiosResponse {
  return {
    config,
    status,
    statusText: String(status),
    data,
    headers: new AxiosHeaders(),
  };
}
function rejectHttp(config: InternalAxiosRequestConfig, status: number): never {
  throw new AxiosError(
    'Request failed',
    AxiosError.ERR_BAD_RESPONSE,
    config,
    undefined,
    response(config, status, {
      error: {
        code: 'TEST_ERROR',
        message: 'Not exposed',
        details: null,
        requestId: 'test-request',
      },
    }),
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
function expiredListener() {
  const listener = vi.fn();
  subscriptions.push(onSessionExpired(listener));
  return listener;
}

describe('authentication response boundary', () => {
  it('accepts the SelfAccount distinction between account ID and doctor ID', () => {
    expect(parseSelfAccount(account)).toMatchObject({
      role: 'STAFF',
      doctorId: null,
    });
    expect(
      parseSelfAccount({ ...account, role: 'DOCTOR', doctorId: 'test-doctor' }),
    ).toMatchObject({ id: 'test-staff', doctorId: 'test-doctor' });
  });

  it.each(['SUPERADMIN', 'doctor', null])(
    'rejects an unknown role: %s',
    (role) => {
      expect(() => parseSelfAccount({ ...account, role })).toThrow(ApiError);
    },
  );

  it('rejects inactive accounts and incomplete doctor identity', () => {
    expect(() => parseSelfAccount({ ...account, status: 'INACTIVE' })).toThrow(
      ApiError,
    );
    for (const doctorId of [undefined, null, '']) {
      expect(() =>
        parseSelfAccount({ ...account, role: 'DOCTOR', doctorId }),
      ).toThrow(ApiError);
    }
    expect(() =>
      parseSelfAccount({ ...account, doctorId: 'unexpected-doctor' }),
    ).toThrow(ApiError);
  });
});

describe('explicit development mock selection', () => {
  it('defaults to the API and enables mock only through an explicit development setting', () => {
    expect(resolveApiMode(true, undefined)).toBe('api');
    expect(resolveApiMode(true, '')).toBe('api');
    expect(resolveApiMode(true, 'api')).toBe('api');
    expect(resolveApiMode(false, undefined)).toBe('api');
    expect(resolveApiMode(false, 'api')).toBe('api');
    expect(resolveApiMode(true, 'mock')).toBe('mock');
  });

  it('rejects production mock and unrecognized settings', () => {
    expect(() => resolveApiMode(false, 'mock')).toThrow('disabled');
    expect(() => resolveApiMode(true, 'automatic')).toThrow();
  });
});

describe('session expiration request ownership', () => {
  it('does not expire a new session when an old in-flight request returns 401', async () => {
    const expired = expiredListener();
    const started = deferred<InternalAxiosRequestConfig>();
    const pending = deferred<AxiosResponse>();
    apiClient.defaults.adapter = (config) => {
      started.resolve(config);
      return pending.promise;
    };
    const result = apiClient.get('/patients').catch((error: unknown) => error);
    const config = await started.promise;
    advanceSessionGeneration();
    pending.reject(
      new AxiosError(
        'Expired old session',
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        response(config, 401),
      ),
    );
    expect(await result).toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
  });

  it('expires the current session for a current request 401', async () => {
    const expired = expiredListener();
    apiClient.defaults.adapter = async (config) => rejectHttp(config, 401);
    await expect(apiClient.get('/patients')).rejects.toMatchObject({
      status: 401,
    });
    expect(expired).toHaveBeenCalledOnce();
  });
});

describe('OpenAPI authentication adapter', () => {
  it('unwraps login data using cookie credentials and the declared auth path', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push(config);
      return response(config, 200, { data: account, meta: null });
    };
    await expect(
      apiAuthService.login({
        identifier: account.email,
        password: 'synthetic-test-password',
      }),
    ).resolves.toMatchObject({ id: account.id, role: 'STAFF' });
    expect(JSON.parse(requests[0].data)).toEqual({
      email: account.email,
      password: 'synthetic-test-password',
    });
    expect(requests[0]).toMatchObject({
      method: 'post',
      baseURL: '/api/v1',
      url: '/auth/login',
      withCredentials: true,
    });
  });

  it('maps /auth/me 401 to anonymous without a global expiration callback', async () => {
    const expired = expiredListener();
    apiClient.defaults.adapter = async (config) => rejectHttp(config, 401);
    await expect(apiAuthService.me()).resolves.toBeNull();
    expect(expired).not.toHaveBeenCalled();
  });

  it('preserves an unimplemented /auth/me failure without mock fallback', async () => {
    apiClient.defaults.adapter = async (config) => rejectHttp(config, 404);
    await expect(apiAuthService.me()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'TEST_ERROR',
      status: 404,
      requestId: 'test-request',
    });
  });

  it('rejects invalid login credentials without expiring a different session', async () => {
    const expired = expiredListener();
    apiClient.defaults.adapter = async (config) => rejectHttp(config, 401);
    await expect(
      apiAuthService.login({
        identifier: account.email,
        password: 'wrong-test-password',
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
  });

  it('accepts the bodyless logout response', async () => {
    const paths: Array<string | undefined> = [];
    apiClient.defaults.adapter = async (config) => {
      paths.push(config.url);
      return response(config, 204);
    };
    await expect(apiAuthService.logout()).resolves.toBeUndefined();
    expect(paths).toEqual(['/auth/logout']);
  });
});

describe('OpenAPI invitation and reset adapters', () => {
  it('uses AUTH_04 and AUTH_06 POST bodies with cancellation, without token query parameters', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    const controller = new AbortController();
    const info = {
      name: '합성 의사',
      email: 'doctor@example.test',
      role: 'DOCTOR',
      department: { id: 'demo', name: '내과', status: 'ACTIVE' },
    };
    apiClient.defaults.adapter = async (config) => {
      requests.push(config);
      return response(config, 200, {
        data: config.url?.includes('invitations') ? info : { valid: true },
        meta: null,
      });
    };
    await expect(
      apiAuthService.verifyInvitation('synthetic-token', controller.signal),
    ).resolves.toEqual(info);
    await expect(
      apiAuthService.verifyPasswordReset('synthetic-token', controller.signal),
    ).resolves.toBeUndefined();
    expect(requests.map((request) => request.url)).toEqual([
      '/auth/invitations/verify',
      '/auth/password-resets/verify',
    ]);
    for (const request of requests) {
      expect(request.method).toBe('post');
      expect(request.signal).toBe(controller.signal);
      expect(JSON.parse(request.data)).toEqual({ token: 'synthetic-token' });
      expect(request.params).toBeUndefined();
    }
  });
  it('uses AUTH_05 and AUTH_07 exact request fields and accepts 201/204 responses', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push(config);
      return response(config, config.url?.includes('invitations') ? 201 : 204, {
        data: { accountId: 'demo' },
        meta: null,
      });
    };
    const input = {
      token: 'synthetic-token',
      password: 'synthetic-new-value',
      passwordConfirm: 'synthetic-new-value',
    };
    await expect(
      apiAuthService.acceptInvitation(input),
    ).resolves.toBeUndefined();
    await expect(
      apiAuthService.confirmPasswordReset(input),
    ).resolves.toBeUndefined();
    expect(requests.map((request) => request.url)).toEqual([
      '/auth/invitations/accept',
      '/auth/password-resets/confirm',
    ]);
    for (const request of requests) {
      expect(request.method).toBe('post');
      expect(JSON.parse(request.data)).toEqual(input);
    }
  });
  it('rejects malformed invitation or reset verification responses', async () => {
    apiClient.defaults.adapter = async (config) =>
      response(config, 200, { data: { role: 'SUPERADMIN', valid: false } });
    await expect(
      apiAuthService.verifyInvitation('synthetic-token'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      apiAuthService.verifyPasswordReset('synthetic-token'),
    ).rejects.toMatchObject({ status: 410 });
  });
});
