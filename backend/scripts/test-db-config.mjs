import { config } from 'dotenv';

config({ path: '.env.test', quiet: true });
config({ path: '.env', quiet: true });

// 테스트 명령이 개발·공유 DB의 마이그레이션 이력을 변경하지 않도록 제한한다.
export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL을 독립된 로컬 테스트 DB로 설정하세요.');
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/hospital_management_test' ||
    [...url.searchParams.keys()].some((key) => key !== 'schema') ||
    url.searchParams.getAll('schema').length > 1 ||
    (url.searchParams.get('schema') ?? 'public') !== 'public'
  ) {
    throw new Error('테스트 DB는 localhost의 hospital_management_test/public이어야 합니다.');
  }
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL);
    const localhost = (host) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(host) ? 'local' : host;
    if (
      localhost(dev.hostname) === localhost(url.hostname) &&
      (dev.port || '5432') === (url.port || '5432') &&
      dev.pathname === url.pathname
    ) {
      throw new Error('개발 DB와 테스트 DB는 서로 달라야 합니다.');
    }
  }
  return value;
}
