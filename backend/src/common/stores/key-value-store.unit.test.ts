import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from './key-value-store.js';

describe('메모리 키-값 저장소', () => {
  it('유효 시간이 지나면 값이 사라진다', async () => {
    let now = 1_000;
    const store = new MemoryKeyValueStore(() => now);
    await store.set('key', 'value', 10);
    now += 9_999;
    expect(await store.get('key')).toBe('value');
    now += 1;
    expect(await store.get('key')).toBeNull();
    expect(await store.take('key')).toBeNull();
  });

  it('take는 값을 한 번만 내준다', async () => {
    const store = new MemoryKeyValueStore();
    await store.set('key', 'value', 60);
    expect(await Promise.all([store.take('key'), store.take('key')])).toEqual(['value', null]);
    expect(await store.get('key')).toBeNull();
  });

  it('값을 덮어쓰거나 지울 수 있고, 없는 숫자는 1부터 센다', async () => {
    const store = new MemoryKeyValueStore();
    await store.set('key', 'first', 60);
    await store.set('key', 'second', 60);
    expect(await store.get('key')).toBe('second');
    await store.delete('key');
    expect(await store.get('key')).toBeNull();
    expect(await store.increment('count')).toBe(1);
    expect(await store.increment('count')).toBe(2);
    expect(await store.get('count')).toBe('2');
  });
});
