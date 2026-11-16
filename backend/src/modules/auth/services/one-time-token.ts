// 초대와 비밀번호 재설정이 함께 쓰는 일회용 링크 토큰.
import { createHash, randomBytes } from 'node:crypto';
import type { KeyValueStore } from '../../../common/stores/key-value-store.js';

/** 용도가 다르면 저장 위치도 달라서, 초대 토큰을 재설정에 쓰거나 그 반대로 쓸 수 없다. */
export type TokenKind = 'invitation' | 'password-reset';

type StoredToken<T> = { payload: T; expiresAt: number };

// 저장소에는 토큰 원문 대신 해시를 둔다. 저장소 내용이 노출돼도 링크를 만들어 낼 수 없다.
const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenKey = (kind: TokenKind, tokenHash: string) => `hospital:${kind}:token:${tokenHash}`;
const ownerKey = (kind: TokenKind, owner: string) => `hospital:${kind}:owner:${owner}`;

function parse<T>(raw: string | null): StoredToken<T> | null {
  if (!raw) return null;
  const stored = JSON.parse(raw) as StoredToken<T>;
  return stored.expiresAt > Date.now() ? stored : null;
}

/** 추측할 수 없는 토큰을 만들어 내용과 함께 보관한다. 아직 대상의 유효한 링크로 등록되지는 않았다. */
export async function issueToken<T>(
  store: KeyValueStore,
  kind: TokenKind,
  payload: T,
  ttlSeconds: number,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const stored: StoredToken<T> = { payload, expiresAt: Date.now() + ttlSeconds * 1000 };
  await store.set(tokenKey(kind, hashOf(token)), JSON.stringify(stored), ttlSeconds);
  return token;
}

/** 메일 발송에 성공한 토큰을 대상(이메일 또는 계정)의 유일한 유효 링크로 등록하고, 이전 링크는 폐기한다. */
export async function activateToken(
  store: KeyValueStore,
  kind: TokenKind,
  owner: string,
  token: string,
  ttlSeconds: number,
): Promise<void> {
  const tokenHash = hashOf(token);
  const previous = await store.get(ownerKey(kind, owner));
  await store.set(ownerKey(kind, owner), tokenHash, ttlSeconds);
  if (previous && previous !== tokenHash) await store.delete(tokenKey(kind, previous));
}

/** 메일 발송에 실패한 토큰을 지운다. */
export async function discardToken(store: KeyValueStore, kind: TokenKind, token: string) {
  await store.delete(tokenKey(kind, hashOf(token)));
}

/** 토큰을 소비하지 않고 내용만 확인한다. 링크를 열었을 때의 검증에 사용한다. */
export async function readToken<T>(
  store: KeyValueStore,
  kind: TokenKind,
  token: string,
): Promise<T | null> {
  return parse<T>(await store.get(tokenKey(kind, hashOf(token))))?.payload ?? null;
}

export type TakenToken<T> = StoredToken<T> & { tokenHash: string };

/** 토큰을 꺼내면서 지운다. 같은 토큰으로 동시에 요청해도 한 요청만 내용을 받는다. */
export async function takeToken<T>(
  store: KeyValueStore,
  kind: TokenKind,
  token: string,
): Promise<TakenToken<T> | null> {
  const tokenHash = hashOf(token);
  const stored = parse<T>(await store.take(tokenKey(kind, tokenHash)));
  return stored && { ...stored, tokenHash };
}

/** 토큰을 꺼낸 뒤의 작업이 실패했을 때 남은 시간만큼 되돌려 놓아 다시 시도할 수 있게 한다. */
export async function restoreToken<T>(
  store: KeyValueStore,
  kind: TokenKind,
  owner: string,
  taken: TakenToken<T>,
): Promise<void> {
  const remainingSeconds = Math.floor((taken.expiresAt - Date.now()) / 1000);
  // 그 사이 새 링크가 발급되었다면 이전 링크를 되살리지 않는다.
  if (remainingSeconds <= 0 || (await store.get(ownerKey(kind, owner))) !== taken.tokenHash) return;
  const stored: StoredToken<T> = { payload: taken.payload, expiresAt: taken.expiresAt };
  await store.set(tokenKey(kind, taken.tokenHash), JSON.stringify(stored), remainingSeconds);
}

/** 작업이 끝난 토큰의 등록 정보를 정리한다. */
export async function finishToken<T>(
  store: KeyValueStore,
  kind: TokenKind,
  owner: string,
  taken: TakenToken<T>,
): Promise<void> {
  if ((await store.get(ownerKey(kind, owner))) === taken.tokenHash)
    await store.delete(ownerKey(kind, owner));
}
