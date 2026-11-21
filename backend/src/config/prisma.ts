import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (!databaseUrl) throw new Error('DATABASE_URL이 필요합니다.');
  const url = new URL(databaseUrl);
  const options = url.searchParams.get('options');
  // The pg adapter reads timestamptz as UTC without applying the server's offset.
  url.searchParams.set('options', [options, '-c TimeZone=UTC'].filter(Boolean).join(' '));
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
}

let client: PrismaClient | undefined;

// 업무 서비스들이 같은 프로세스의 연결 풀을 공유한다.
export function getPrismaClient(): PrismaClient {
  if (!client) client = createPrismaClient(process.env.DATABASE_URL ?? '');
  return client;
}
