import axios, { type InternalAxiosRequestConfig } from 'axios';
import { normalizeApiError } from './errors';
import { getSessionGeneration } from './sessionGeneration';

const expiredListeners = new Set<() => void>();
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

type SessionRequest = InternalAxiosRequestConfig & {
  sessionGeneration?: number;
};
apiClient.interceptors.request.use((config) => {
  (config as SessionRequest).sessionGeneration = getSessionGeneration();
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeApiError(error);
    // Bootstrap and invalid credentials are handled by the auth service itself.
    if (
      normalized.status === 401 &&
      (error.config as SessionRequest | undefined)?.sessionGeneration ===
        getSessionGeneration() &&
      !['/auth/login', '/auth/me'].includes(error.config?.url)
    ) {
      expiredListeners.forEach((listener) => listener());
    }
    return Promise.reject(normalized);
  },
);
