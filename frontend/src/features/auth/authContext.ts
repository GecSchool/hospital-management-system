import { createContext } from 'react';
import type { SelfAccount } from '../../types/auth';
import type { AuthService, LoginCredentials } from './authService';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
interface AuthContextValue {
  user: SelfAccount | null;
  status: AuthStatus;
  error: string | null;
  loginIdentifier: AuthService['loginIdentifier'];
  developmentLogin?: AuthService['developmentLogin'];
  service: AuthService;
  clearSession(): void;
  login(input: LoginCredentials): Promise<SelfAccount>;
  logout(): Promise<void>;
  retry(): void;
}
// Keep the context outside the Fast Refresh component boundary.
export const AuthContext = createContext<AuthContextValue | null>(null);
