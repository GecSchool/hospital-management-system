import type { DepartmentSummary, Role, SelfAccount } from '../../types/auth';
export type AuthLinkKind = 'invitation' | 'reset';
export interface InvitationInfo {
  name: string;
  email: string;
  role: Role;
  department: DepartmentSummary | null;
}
export interface PasswordSubmission {
  token: string;
  password: string;
  passwordConfirm: string;
}
/** UI credentials are independent of the email-based OpenAPI request. */
export interface LoginCredentials {
  identifier: string;
  password: string;
}
export interface AuthService {
  /** Optional live session revocation source; server/API errors retain their existing boundary. */
  onSessionInvalidated?(listener: () => void): () => void;
  onAccountChanged?(listener: (account: SelfAccount) => void): () => void;
  readonly loginIdentifier: 'email' | 'username';
  readonly developmentLogin?: {
    identifiers: readonly string[];
    password: string;
    scenarios?: readonly { identifier: string; label: string }[];
  };
  readonly developmentLinks?: readonly {
    kind: AuthLinkKind;
    scenario: string;
    label: string;
  }[];
  developmentToken?(kind: AuthLinkKind, scenario: string): string | undefined;
  me(signal?: AbortSignal): Promise<SelfAccount | null>;
  login(input: LoginCredentials): Promise<SelfAccount>;
  logout(): Promise<void>;
  verifyInvitation(
    token: string,
    signal?: AbortSignal,
  ): Promise<InvitationInfo>;
  acceptInvitation(input: PasswordSubmission): Promise<void>;
  verifyPasswordReset(token: string, signal?: AbortSignal): Promise<void>;
  confirmPasswordReset(input: PasswordSubmission): Promise<void>;
}
