import type { Prisma } from '../../../generated/prisma/client.js';

// 예약·접수 및 시간표 변경도 같은 의사 키를 사용해야 동시성 규칙이 완성된다.
export async function lockDoctorWork(tx: Prisma.TransactionClient, accountId: string) {
  const key = `hospital:doctor-work:${accountId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function lockAccountStatus(tx: Prisma.TransactionClient) {
  const key = 'hospital:account-status';
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
