import type { AccountStatus, Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../common/errors/index.js';
import { getPrismaClient } from '../../../config/prisma.js';
import {
  lockAccountStatus,
  lockDoctorWork,
} from '../../medical-staff/services/doctor-work-lock.js';
import { hasPendingDoctorWork } from '../../medical-staff/services/doctor-work.service.js';
import { accountSummarySelect, toAccountSummary } from './account-summary.js';

export async function requireActiveAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.account.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
  if (actor.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
}

export async function changeAccountStatus(
  actorId: string,
  accountId: string,
  status: AccountStatus,
) {
  return getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    await requireActiveAdmin(tx, actorId);
    await lockDoctorWork(tx, accountId);
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: accountSummarySelect,
    });
    if (!account) throw new AppError(404, 'NOT_FOUND', '계정을 찾을 수 없습니다.');
    if (account.status === status) return toAccountSummary(account);
    if (status === 'INACTIVE' && account.role === 'ADMIN') {
      const count = await tx.account.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      if (count <= 1)
        throw new AppError(
          409,
          'LAST_ACTIVE_ADMIN',
          '마지막 활성 관리자는 비활성화할 수 없습니다.',
        );
    }
    if (
      status === 'INACTIVE' &&
      account.role === 'DOCTOR' &&
      (await hasPendingDoctorWork(tx, accountId))
    )
      throw new AppError(
        409,
        'DOCTOR_HAS_PENDING_WORK',
        '미처리 업무가 있는 의사는 비활성화할 수 없습니다.',
      );
    return toAccountSummary(
      await tx.account.update({
        where: { id: accountId },
        data: { status },
        select: accountSummarySelect,
      }),
    );
  });
}
