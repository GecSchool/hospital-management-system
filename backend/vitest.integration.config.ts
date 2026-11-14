import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 격리 DB를 공유하는 파일끼리는 순차 실행한다. 각 테스트의 동시 요청 검증은 유지한다.
  test: {
    include: ['src/**/*.integration.test.ts', 'tests/**/*.integration.test.ts'],
    fileParallelism: false,
  },
});
