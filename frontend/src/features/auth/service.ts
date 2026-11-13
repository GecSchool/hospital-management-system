import { apiMode } from '../../services/mode';
import { apiAuthService } from './apiAuthService';
import type { AuthService } from './authService';

// Vite removes this dynamic import from production; there is no API-error fallback.
export const authService: AuthService =
  import.meta.env.DEV && apiMode === 'mock'
    ? (await import('../../services/mock/auth')).createMockAuthService()
    : apiAuthService;
