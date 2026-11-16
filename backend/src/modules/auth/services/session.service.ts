// AUTH-01~03 로그인·로그아웃·내 계정의 업무 규칙과 세션 처리.
import type { Request, Response } from 'express';
import { AppError } from '../../../common/errors/index.js';
import type { KeyValueStore } from '../../../common/stores/key-value-store.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { sessionCookieOptions } from '../../../config/session.js';
import { accountSummarySelect, toAccountSummary } from '../../account/services/account-summary.js';
import { SESSION_ABSOLUTE_MS, SESSION_COOKIE_NAME } from '../auth-policy.js';
import { verifyAgainstDummy, verifyPassword } from './password.js';

const epochKey = (accountId: string) => `hospital:session-epoch:${accountId}`;

async function currentEpoch(store: KeyValueStore, accountId: string): Promise<number> {
  return Number((await store.get(epochKey(accountId))) ?? 0);
}

/** 이메일과 비밀번호를 확인하고 계정 요약을 반환한다. */
export async function authenticate(email: string, password: string) {
  const account = await getPrismaClient().account.findUnique({
    where: { email },
    select: { ...accountSummarySelect, passwordHash: true },
  });
  let passwordMatches = false;
  if (account) passwordMatches = await verifyPassword(account.passwordHash, password);
  else await verifyAgainstDummy(password);
  // 이메일이 없는 경우와 비밀번호가 틀린 경우를 같은 응답으로 돌려준다.
  if (!account || !passwordMatches)
    throw new AppError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  // 비밀번호를 맞힌 사람에게만 비활성 상태를 알려 준다.
  if (account.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
  return toAccountSummary(account);
}

/** 로그인 성공 시 세션 ID를 새로 발급하고 계정 ID를 세션에 기록한다. */
export async function startSession(req: Request, accountId: string, store: KeyValueStore) {
  const epoch = await currentEpoch(store, accountId);
  // 로그인 전 세션 ID를 계속 쓰지 않는다. 미리 심어 둔 세션 ID로 로그인을 가로채는 공격을 막는다.
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.accountId = accountId;
  req.session.loginAt = Date.now();
  req.session.epoch = epoch;
  await new Promise<void>((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
}

export async function destroySession(req: Request): Promise<void> {
  if (!req.session) return;
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((error) => (error ? reject(error) : resolve())),
  );
}

/** 세션을 지우고 브라우저의 쿠키도 삭제한다. 세션이 없어도 같은 결과를 낸다. */
export async function endSession(req: Request, res: Response) {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions, secure: req.secure });
}

/** 이 계정으로 로그인된 모든 세션을 무효화한다. 비밀번호가 바뀌었을 때 호출한다. */
export async function invalidateAccountSessions(store: KeyValueStore, accountId: string) {
  await store.increment(epochKey(accountId));
}

/**
 * 요청의 세션에서 계정 ID를 꺼낸다. 유효하지 않은 세션이면 지우고 null을 반환한다.
 * 계정의 상태·역할·소속은 이 ID로 공통 인증 제공자가 매 요청 DB에서 다시 읽는다.
 */
export function createSessionAccountResolver(store: KeyValueStore) {
  return async (req: Request): Promise<string | null> => {
    const session = req.session;
    if (!session?.accountId) return null;
    const expired = Date.now() - (session.loginAt ?? 0) > SESSION_ABSOLUTE_MS;
    const revoked = (await currentEpoch(store, session.accountId)) !== (session.epoch ?? 0);
    if (expired || revoked) {
      await destroySession(req);
      return null;
    }
    return session.accountId;
  };
}
