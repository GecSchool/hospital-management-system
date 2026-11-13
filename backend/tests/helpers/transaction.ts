import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

/** 각 통합 테스트의 데이터를 별도 트랜잭션에서 만들고 항상 롤백한다. */
export async function withRollback(
  prisma: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const rollback = new Error('test rollback');
  let completed = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        await run(tx);
        completed = true;
        throw rollback;
      },
      { timeout: 15000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }

  if (!completed) throw new Error('테스트 트랜잭션이 정상적으로 롤백되지 않았습니다.');
}
