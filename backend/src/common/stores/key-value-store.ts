import type { RedisClientType } from 'redis';

/**
 * 만료 시간이 있는 값을 잠시 보관하는 저장소. 초대·재설정 토큰과 세션 무효화 번호에 사용한다.
 * 운영에서는 Redis를, Redis가 없는 로컬 개발·테스트에서는 메모리를 사용한다.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  /** ttlSeconds가 지나면 값이 자동으로 사라진다. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** 값을 읽으면서 동시에 지운다. 두 요청이 같은 값을 함께 가져갈 수 없다. */
  take(key: string): Promise<string | null>;
  /** 숫자를 1 늘리고 늘어난 값을 반환한다. 값이 없으면 1이 된다. */
  increment(key: string): Promise<number>;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  private read(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async get(key: string) {
    return this.read(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async delete(key: string) {
    this.entries.delete(key);
  }

  async take(key: string) {
    const value = this.read(key);
    this.entries.delete(key);
    return value;
  }

  async increment(key: string) {
    const next = Number(this.read(key) ?? 0) + 1;
    this.entries.set(key, { value: String(next), expiresAt: null });
    return next;
  }
}

export class RedisKeyValueStore implements KeyValueStore {
  constructor(private readonly client: RedisClientType) {}

  get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async delete(key: string) {
    await this.client.del(key);
  }

  take(key: string) {
    return this.client.getDel(key);
  }

  increment(key: string) {
    return this.client.incr(key);
  }
}
