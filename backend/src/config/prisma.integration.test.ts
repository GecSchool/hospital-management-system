import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './prisma.js';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';

const prisma = createPrismaClient(testDatabaseUrl());

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Prisma 연결', () => {
  it('격리된 테스트 DB에서 Prisma 쿼리를 실행한다', async () => {
    const result = await prisma.$queryRaw<
      Array<{ database: string }>
    >`SELECT current_database() AS database`;
    expect(result[0].database).toBe('hospital_management_test');
  });
});
