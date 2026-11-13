import type { Prisma } from '../../../generated/prisma/client.js';
import { businessDate } from '../../../common/utils/time.js';

// 호출자는 의사별 변경 잠금을 확보한 트랜잭션을 전달한다.
export async function hasPendingDoctorWork(
  tx: Prisma.TransactionClient,
  doctorAccountId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const startOfToday = new Date(`${businessDate(now)}T00:00:00+09:00`);
  const [appointment, reception] = await Promise.all([
    tx.appointment.findFirst({
      where: {
        doctorAccountId,
        status: 'BOOKED',
        startsAt: { gte: startOfToday },
        reception: { is: null },
      },
      select: { id: true },
    }),
    tx.reception.findFirst({
      where: {
        doctorAccountId,
        OR: [{ visit: { is: null } }, { visit: { is: { status: 'IN_PROGRESS' } } }],
      },
      select: { id: true },
    }),
  ]);
  return appointment !== null || reception !== null;
}
