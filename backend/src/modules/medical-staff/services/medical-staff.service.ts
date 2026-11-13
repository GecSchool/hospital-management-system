import type { Prisma } from '../../../generated/prisma/client.js';
import { paginationMeta } from '../../../common/utils/pagination.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';
import type { parseMedicalStaffQuery } from '../validations/medical-staff.validation.js';

export async function listMedicalStaff(departmentId: string, query: ReturnType<typeof parseMedicalStaffQuery>) {
  const where: Prisma.AccountWhereInput = {
    OR: [
      { role: 'DOCTOR', doctor: { is: { departmentId } } },
      { role: 'NURSE', nurse: { is: { departmentId } } },
    ],
    ...(query.role && { role: query.role }),
  };
  const database = getPrismaClient();
  const [accounts, totalItems] = await Promise.all([
    database.account.findMany({ where, select: accountSummarySelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: query.skip, take: query.size }),
    database.account.count({ where }),
  ]);
  return { data: accounts.map(toAccountSummary), meta: paginationMeta(query.page, query.size, totalItems) };
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
  return doctors.map((doctor) => ({ id: doctor.accountId, name: doctor.account.name, department: doctor.department }));
}
