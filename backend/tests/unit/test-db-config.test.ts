import { afterEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';

const originalTest = process.env.TEST_DATABASE_URL;
const originalDev = process.env.DATABASE_URL;

afterEach(() => {
  if (originalTest === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = originalTest;
  if (originalDev === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDev;
});

describe('테스트 DB 보호', () => {
  it('테스트 URL이 없으면 중단한다', () => {
    delete process.env.TEST_DATABASE_URL;
    expect(() => testDatabaseUrl()).toThrow('TEST_DATABASE_URL');
  });

  it('원격 서버나 잘못된 DB 이름을 허용하지 않는다', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@example.com/hospital_management_test';
    expect(() => testDatabaseUrl()).toThrow();
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost/hospital_dev';
    expect(() => testDatabaseUrl()).toThrow();
  });

  it('개발 DB와 테스트 DB가 같으면 중단한다', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/hospital_management_test';
    process.env.DATABASE_URL = 'postgresql://other:other@127.0.0.1:5432/hospital_management_test';
    expect(() => testDatabaseUrl()).toThrow('서로 달라야');
  });

  it('분리된 로컬 테스트 DB를 허용한다', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/hospital_management_test';
    process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/hospital_dev';
    expect(testDatabaseUrl()).toBe(process.env.TEST_DATABASE_URL);
  });

  it('연결 대상을 바꿀 수 있는 추가 URL 매개변수는 허용하지 않는다', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost/hospital_management_test?host=example.com';
    expect(() => testDatabaseUrl()).toThrow();
  });
});
