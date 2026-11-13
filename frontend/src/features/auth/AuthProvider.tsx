import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSessionExpired } from '../../services/api/client';
import { normalizeApiError } from '../../services/api/errors';
import { advanceSessionGeneration } from '../../services/api/sessionGeneration';
import type { SelfAccount } from '../../types/auth';
import type { AuthService, LoginCredentials } from './authService';
import { authService } from './service';
import { AuthContext, type AuthStatus } from './authContext';
import { authErrorMessage } from './authMessages';

/** Component-only module: context identity survives provider Fast Refresh. */
export function AuthProvider({
  children,
  service = authService,
}: {
  children: ReactNode;
  service?: AuthService;
}) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SelfAccount | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);

  const forgetAccount = useCallback(
    (message: string | null = null) => {
      revision.current += 1;
      advanceSessionGeneration();
      queryClient.clear();
      setUser(null);
      setError(message);
      setStatus('anonymous');
    },
    [queryClient],
  );

  useEffect(
    () => service.onSessionInvalidated?.(() => forgetAccount()),
    [service, forgetAccount],
  );
  useEffect(
    () =>
      service.onAccountChanged?.((account) => {
        revision.current += 1;
        advanceSessionGeneration();
        queryClient.clear();
        setUser(account);
        setStatus('authenticated');
        setError(null);
      }),
    [service, queryClient],
  );

  useEffect(
    () =>
      onSessionExpired(() =>
        forgetAccount('세션이 만료되었습니다. 다시 로그인해 주세요.'),
      ),
    [forgetAccount],
  );
  useEffect(() => {
    const controller = new AbortController();
    const current = ++revision.current;
    advanceSessionGeneration();
    setStatus('loading');
    setError(null);
    service
      .me(controller.signal)
      .then((account) => {
        if (controller.signal.aborted || current !== revision.current) return;
        queryClient.clear();
        setUser(account);
        setStatus(account ? 'authenticated' : 'anonymous');
      })
      .catch((reason) => {
        if (controller.signal.aborted || current !== revision.current) return;
        queryClient.clear();
        setUser(null);
        setError(
          normalizeApiError(reason).code === 'ACCOUNT_INACTIVE'
            ? authErrorMessage(reason)
            : normalizeApiError(reason).message,
        );
        setStatus('error');
      });
    return () => {
      controller.abort();
    };
  }, [attempt, service, queryClient]);

  async function login(input: LoginCredentials) {
    const current = ++revision.current;
    advanceSessionGeneration();
    queryClient.clear();
    setUser(null);
    setError(null);
    setStatus('anonymous');
    const account = await service.login(input);
    if (current !== revision.current)
      throw new Error('Authentication was superseded.');
    queryClient.clear();
    setUser(account);
    setError(null);
    setStatus('authenticated');
    return account;
  }

  async function logout() {
    const current = revision.current;
    // A failed logout keeps the account visible so the user can retry server logout.
    await service.logout();
    if (current === revision.current) forgetAccount();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error,
        service,
        clearSession: forgetAccount,
        loginIdentifier: service.loginIdentifier,
        developmentLogin: import.meta.env.DEV
          ? service.developmentLogin
          : undefined,
        login,
        logout,
        retry: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
