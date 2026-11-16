import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from '../../../common/stores/key-value-store.js';
import {
  activateToken,
  discardToken,
  finishToken,
  issueToken,
  readToken,
  restoreToken,
  takeToken,
} from './one-time-token.js';

const payload = { accountId: 'account-1' };

describe('일회용 링크 토큰', () => {
  it('추측하기 어려운 토큰을 만들고 저장소에는 원문을 남기지 않는다', async () => {
    const written: string[] = [];
    const store = new MemoryKeyValueStore();
    const set = store.set.bind(store);
    store.set = async (key, value, ttl) => {
      written.push(key, value);
      await set(key, value, ttl);
    };
    const first = await issueToken(store, 'password-reset', payload, 60);
    const second = await issueToken(store, 'password-reset', payload, 60);
    expect(first).toMatch(/^[\w-]{43}$/);
    expect(second).not.toBe(first);
    expect(written.join(' ')).not.toContain(first);
    expect(await readToken(store, 'password-reset', first)).toEqual(payload);
  });

  it('읽기는 여러 번 할 수 있지만 꺼내기는 한 번만 된다', async () => {
    const store = new MemoryKeyValueStore();
    const token = await issueToken(store, 'invitation', payload, 60);
    expect(await readToken(store, 'invitation', token)).toEqual(payload);
    expect(await readToken(store, 'invitation', token)).toEqual(payload);
    expect((await takeToken(store, 'invitation', token))?.payload).toEqual(payload);
    expect(await takeToken(store, 'invitation', token)).toBeNull();
    expect(await readToken(store, 'invitation', token)).toBeNull();
  });

  it('용도가 다른 토큰은 찾지 못한다', async () => {
    const store = new MemoryKeyValueStore();
    const token = await issueToken(store, 'invitation', payload, 60);
    expect(await readToken(store, 'password-reset', token)).toBeNull();
    expect(await takeToken(store, 'password-reset', token)).toBeNull();
    expect(await readToken(store, 'invitation', token)).toEqual(payload);
  });

  it('새 토큰을 등록하면 같은 대상의 이전 토큰은 폐기된다', async () => {
    const store = new MemoryKeyValueStore();
    const first = await issueToken(store, 'invitation', payload, 60);
    await activateToken(store, 'invitation', 'a@example.test', first, 60);
    const second = await issueToken(store, 'invitation', payload, 60);
    // 등록 전에는 두 토큰이 모두 유효하다. 메일 발송에 실패하면 새 토큰만 버린다.
    expect(await readToken(store, 'invitation', first)).toEqual(payload);
    await activateToken(store, 'invitation', 'a@example.test', second, 60);
    expect(await readToken(store, 'invitation', first)).toBeNull();
    expect(await readToken(store, 'invitation', second)).toEqual(payload);
    const other = await issueToken(store, 'invitation', payload, 60);
    await activateToken(store, 'invitation', 'b@example.test', other, 60);
    expect(await readToken(store, 'invitation', second)).toEqual(payload);
    await discardToken(store, 'invitation', other);
    expect(await readToken(store, 'invitation', other)).toBeNull();
  });

  it('꺼낸 토큰은 실패 시 되돌릴 수 있지만, 그 사이 새 토큰이 등록되었으면 되돌리지 않는다', async () => {
    const store = new MemoryKeyValueStore();
    const token = await issueToken(store, 'password-reset', payload, 60);
    await activateToken(store, 'password-reset', 'account-1', token, 60);
    const taken = await takeToken<typeof payload>(store, 'password-reset', token);
    await restoreToken(store, 'password-reset', 'account-1', taken!);
    expect(await readToken(store, 'password-reset', token)).toEqual(payload);

    const again = await takeToken<typeof payload>(store, 'password-reset', token);
    const newer = await issueToken(store, 'password-reset', payload, 60);
    await activateToken(store, 'password-reset', 'account-1', newer, 60);
    await restoreToken(store, 'password-reset', 'account-1', again!);
    expect(await readToken(store, 'password-reset', token)).toBeNull();
    expect(await readToken(store, 'password-reset', newer)).toEqual(payload);
  });

  it('작업을 마친 토큰은 되돌릴 수 없다', async () => {
    const store = new MemoryKeyValueStore();
    const token = await issueToken(store, 'password-reset', payload, 60);
    await activateToken(store, 'password-reset', 'account-1', token, 60);
    const taken = await takeToken<typeof payload>(store, 'password-reset', token);
    await finishToken(store, 'password-reset', 'account-1', taken!);
    await restoreToken(store, 'password-reset', 'account-1', taken!);
    expect(await readToken(store, 'password-reset', token)).toBeNull();
  });
});
