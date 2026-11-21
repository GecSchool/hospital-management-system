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

  it('PostgreSQL 기본 시각이 서울이어도 같은 순간을 UTC로 읽는다', async () => {
    const url = new URL(testDatabaseUrl());
    url.searchParams.set('options', '-c TimeZone=Asia/Seoul');
    const seoulClient = createPrismaClient(url.toString());
    try {
      const [result] = await seoulClient.$queryRaw<
        Array<{ instant: Date; zone: string }>
      >`SELECT TIMESTAMPTZ '2026-11-20 09:00:00+09' AS instant, current_setting('TimeZone') AS zone`;
      expect(result.zone).toBe('UTC');
      expect(result.instant.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    } finally {
      await seoulClient.$disconnect();
    }
  });
});
