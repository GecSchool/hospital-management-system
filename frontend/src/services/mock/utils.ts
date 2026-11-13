import type { SelfAccount } from '../../types/auth';

/** DEVELOPMENT ONLY. Keep existing ISO precision and injected clock semantics. */
export function mockTimestamp(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().replace('Z', '+09:00');
}

/** Same explicit author allowlist for clinical/nursing originals and corrections. */
export function mockRecordAuthor(account: SelfAccount) {
  return structuredClone({
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
    department: account.department,
    doctorId: account.doctorId,
  });
}
