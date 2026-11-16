import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisKeyValueStore } from './key-value-store.js';

// 로컬 Redis가 있을 때만 실행한다. 예: TEST_REDIS_URL=redis://127.0.0.1:6379
const url = process.env.TEST_REDIS_URL;

describe.skipIf(!url)('Redis 키-값 저장소', () => {
  const client: RedisClientType = createClient({ url });
  const store = new RedisKeyValueStore(client);
  const key = `hospital:test:${randomUUID()}`;
  beforeAll(async () => {
    await client.connect();
  });
  afterAll(async () => {
    await client.del([key, `${key}:count`]);
    await client.close();
  });

  it('메모리 저장소와 같은 방식으로 동작한다', async () => {
    expect(await store.get(key)).toBeNull();
    await store.set(key, 'value', 60);
    expect(await store.get(key)).toBe('value');
    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    expect(await Promise.all([store.take(key), store.take(key)])).toContain('value');
    expect(await store.get(key)).toBeNull();
    await store.set(key, 'value', 60);
    await store.delete(key);
    expect(await store.take(key)).toBeNull();
    expect(await store.increment(`${key}:count`)).toBe(1);
    expect(await store.increment(`${key}:count`)).toBe(2);
  });
});
