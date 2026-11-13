import { spawnSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db-config.mjs';

try {
  const url = testDatabaseUrl();
  const result = spawnSync('npm', ['exec', '--', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
