import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (!databaseUrl) throw new Error('DATABASE_URL이 필요합니다.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

let client: PrismaClient | undefined;

// 업무 서비스들이 같은 프로세스의 연결 풀을 공유한다.
export function getPrismaClient(): PrismaClient {
  if (!client) client = createPrismaClient(process.env.DATABASE_URL ?? '');
  return client;
}
