import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AccountProvider } from './auth.js';

type AccountDatabase = Pick<Prisma.TransactionClient, 'account'>;

// 인증 구현은 검증된 서버 세션에서만 ID를 추출해야 한다. 요청 헤더·본문의 ID는 신뢰하지 않는다.
export function createAccountProvider(
  getSessionAccountId: (request: Request) => Promise<string | null>,
  getDatabase: () => AccountDatabase,
): AccountProvider {
  return async (request) => {
    const id = await getSessionAccountId(request);
    if (!id) return null;
    const account = await getDatabase().account.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, doctor: { select: { departmentId: true } }, nurse: { select: { departmentId: true } } },
    });
    if (!account) return null;
    const departmentId = account.role === 'DOCTOR' ? account.doctor?.departmentId ?? null
      : account.role === 'NURSE' ? account.nurse?.departmentId ?? null : null;
    return { id: account.id, role: account.role, status: account.status, departmentId };
  };
}
