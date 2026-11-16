import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { MailMessage } from '../../src/common/mail/mailer.js';
import { MemoryKeyValueStore } from '../../src/common/stores/key-value-store.js';
import * as prismaConfig from '../../src/config/prisma.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { buildAuthRuntime } from '../../src/modules/auth/auth-runtime.js';
import { hashPassword } from '../../src/modules/auth/services/password.js';

export const TEST_PASSWORD = 'correct-horse-battery';
export const APP_BASE_URL = 'http://app.test';

let passwordHash: Promise<string> | undefined;
/** 해시 계산은 느리므로 테스트 파일마다 한 번만 수행한다. */
export function testPasswordHash(): Promise<string> {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  return passwordHash;
}

/** 서비스가 테스트 트랜잭션 안에서 조회·저장하게 해 테스트가 끝나면 모두 롤백되도록 한다. */
export function useTransactionAsDatabase(tx: Prisma.TransactionClient) {
  const database = new Proxy(tx, {
    get(target, key, receiver) {
      if (key === '$transaction')
        return async (run: (db: typeof tx) => Promise<unknown>) => run(tx);
      return Reflect.get(target, key, receiver);
    },
  });
  vi.spyOn(prismaConfig, 'getPrismaClient').mockReturnValue(
    database as ReturnType<typeof prismaConfig.getPrismaClient>,
  );
}

/** 실제 세션 미들웨어를 쓰되 Redis와 메일 서버는 메모리 구현으로 바꾼 앱을 만든다. */
export function createAuthTestApp() {
  const store = new MemoryKeyValueStore();
  const sent: MailMessage[] = [];
  let mailFails = false;
  const auth = buildAuthRuntime({
    sessionSecret: 'test-only-session-secret-0123456789abcdef',
    store,
    mailer: {
      async send(message) {
        if (mailFails) throw new Error('SMTP unavailable');
        sent.push(message);
      },
    },
    appBaseUrl: APP_BASE_URL,
  });
  return {
    app: createApp({ port: 3000, corsOrigin: undefined }, { auth }),
    store,
    /** 발송된 메일 목록. 실제로는 어디에도 보내지 않는다. */
    sent,
    setMailFails(value: boolean) {
      mailFails = value;
    },
    /** 가장 최근 메일의 링크에서 토큰을 꺼낸다. */
    lastToken(): string {
      const token = sent.at(-1)?.text.match(/#token=([\w-]+)/)?.[1];
      if (!token) throw new Error('메일에서 토큰을 찾지 못했습니다.');
      return token;
    },
  };
}

/** 역할별 계정과 진료과를 만든다. 비밀번호는 모두 TEST_PASSWORD다. */
export async function createAuthFixture(tx: Prisma.TransactionClient) {
  const key = randomUUID().replaceAll('-', '');
  const hash = await testPasswordHash();
  const department = await tx.department.create({ data: { name: `dep-${key}` } });
  const emptyDepartment = await tx.department.create({ data: { name: `empty-${key}` } });
  const inactiveDepartment = await tx.department.create({
    data: { name: `inactive-${key}`, status: 'INACTIVE' },
  });
  const account = (role: 'ADMIN' | 'STAFF' | 'DOCTOR' | 'NURSE', label: string = role) => ({
    email: `${label.toLowerCase()}-${key}@example.test`,
    name: `${label}-${key}`,
    role,
    passwordHash: hash,
  });
  const admin = await tx.account.create({ data: account('ADMIN') });
  const staff = await tx.account.create({ data: account('STAFF') });
  const doctor = await tx.account.create({
    data: { ...account('DOCTOR'), doctor: { create: { departmentId: department.id } } },
  });
  const nurse = await tx.account.create({
    data: { ...account('NURSE'), nurse: { create: { departmentId: department.id } } },
  });
  const inactive = await tx.account.create({
    data: { ...account('STAFF', 'inactive'), status: 'INACTIVE' },
  });
  return {
    key,
    department,
    emptyDepartment,
    inactiveDepartment,
    admin,
    staff,
    doctor,
    nurse,
    inactive,
  };
}
