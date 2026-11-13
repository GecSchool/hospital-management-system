import type { Prisma } from '../../../generated/prisma/client.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';
import type { parseMedicalStaffQuery } from '../validations/medical-staff.validation.js';
import { AppError } from '../../../common/errors/index.js';
import { hasPendingDoctorWork } from './doctor-work.service.js';
import { lockAccountStatus, lockDoctorWork } from './doctor-work-lock.js';
import { requireActiveAdmin } from '../../account/services/account-status.service.js';

export async function changeDepartment(actorId: string, accountId: string, departmentId: string) {
  return getPrismaClient().$transaction(async (tx) => {
    await lockAccountStatus(tx);
    await requireActiveAdmin(tx, actorId);
    await lockDoctorWork(tx, accountId);
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: accountSummarySelect,
    });
    if (!account) throw new AppError(404, 'NOT_FOUND', '계정을 찾을 수 없습니다.');
    if (account.role !== 'DOCTOR' && account.role !== 'NURSE')
      throw new AppError(400, 'VALIDATION_ERROR', '의료진 계정이 아닙니다.');
    await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${departmentId} FOR UPDATE`;
    const department = await tx.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new AppError(404, 'NOT_FOUND', '진료과를 찾을 수 없습니다.');
    if (department.status !== 'ACTIVE')
      throw new AppError(409, 'CONFLICT', '비활성 진료과로 변경할 수 없습니다.');
    const current =
      account.role === 'DOCTOR' ? account.doctor?.department.id : account.nurse?.department.id;
    if (!current) throw new AppError(409, 'CONFLICT', '의료진 소속 정보가 없습니다.');
    if (current === departmentId) return toAccountSummary(account);
    if (account.role === 'DOCTOR') {
      if (await hasPendingDoctorWork(tx, accountId))
        throw new AppError(
          409,
          'DOCTOR_HAS_PENDING_WORK',
          '미처리 업무가 있는 의사의 소속을 변경할 수 없습니다.',
        );
      await tx.doctor.update({ where: { accountId }, data: { departmentId } });
    } else {
      await tx.nurse.update({ where: { accountId }, data: { departmentId } });
    }
    return toAccountSummary(
      await tx.account.findUniqueOrThrow({
        where: { id: accountId },
        select: accountSummarySelect,
      }),
    );
  });
}

export async function listMedicalStaff(
  departmentId: string,
  query: ReturnType<typeof parseMedicalStaffQuery>,
) {
  const where: Prisma.AccountWhereInput = {
    OR: [
      { role: 'DOCTOR', doctor: { is: { departmentId } } },
      { role: 'NURSE', nurse: { is: { departmentId } } },
    ],
    ...(query.role && { role: query.role }),
  };
  const database = getPrismaClient();
  const [accounts, totalItems] = await Promise.all([
    database.account.findMany({
      where,
      select: accountSummarySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.size,
    }),
    database.account.count({ where }),
  ]);
  return {
    data: accounts.map(toAccountSummary),
    meta: paginationMeta(query.page, query.size, totalItems),
  };
}

export async function listDoctors(departmentId: string, activeOnly?: boolean) {
  const doctors = await getPrismaClient().doctor.findMany({
    where: { departmentId, account: { role: 'DOCTOR', ...(activeOnly && { status: 'ACTIVE' }) } },
    select: {
      accountId: true,
      account: { select: { name: true } },
      department: { select: { id: true, name: true, status: true } },
    },
    orderBy: [{ account: { name: 'asc' } }, { accountId: 'asc' }],
  });
  return doctors.map((doctor) => ({
    id: doctor.accountId,
    name: doctor.account.name,
    department: doctor.department,
  }));
}
