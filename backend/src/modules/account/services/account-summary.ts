import type { Prisma } from '../../../generated/prisma/client.js';

const departmentSelect = { id: true, name: true, status: true } as const;
export const accountSummarySelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  doctor: { select: { department: { select: departmentSelect } } },
  nurse: { select: { department: { select: departmentSelect } } },
} satisfies Prisma.AccountSelect;

type AccountRow = Prisma.AccountGetPayload<{ select: typeof accountSummarySelect }>;

export function toAccountSummary(account: AccountRow) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
    department:
      account.role === 'DOCTOR'
        ? (account.doctor?.department ?? null)
        : account.role === 'NURSE'
          ? (account.nurse?.department ?? null)
          : null,
    doctorId: account.role === 'DOCTOR' ? account.id : null,
  };
}
