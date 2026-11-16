// ACC-05 재설정 메일 요청, AUTH-06 재설정 링크 검증, AUTH-07 비밀번호 재설정.
import { AppError } from '../../../common/errors/index.js';
import type { Mailer } from '../../../common/mail/mailer.js';
import type { KeyValueStore } from '../../../common/stores/key-value-store.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { PASSWORD_RESET_TTL_SECONDS } from '../auth-policy.js';
import { sendPasswordResetMail } from './auth-mail.js';
import {
  activateToken,
  discardToken,
  finishToken,
  issueToken,
  readToken,
  restoreToken,
  takeToken,
} from './one-time-token.js';
import { hashPassword } from './password.js';
import { invalidateAccountSessions } from './session.service.js';

const KIND = 'password-reset';
type ResetPayload = { accountId: string };

const invalidLink = () =>
  new AppError(410, 'RESET_LINK_INVALID', '재설정 링크가 만료되었거나 이미 사용되었습니다.');

/** 대상 계정의 이메일로 재설정 링크를 보낸다. 비활성 계정에도 보낼 수 있고 상태는 바꾸지 않는다. */
export async function requestPasswordReset(
  accountId: string,
  deps: { store: KeyValueStore; mailer: Mailer; appBaseUrl: string },
) {
  const account = await getPrismaClient().account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, email: true },
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', '계정을 찾을 수 없습니다.');
  const payload: ResetPayload = { accountId: account.id };
  const token = await issueToken(deps.store, KIND, payload, PASSWORD_RESET_TTL_SECONDS);
  try {
    await sendPasswordResetMail(deps.mailer, deps.appBaseUrl, account, token);
  } catch (error) {
    await discardToken(deps.store, KIND, token);
    throw error;
  }
  // 같은 계정의 이전 재설정 링크는 이 시점부터 사용할 수 없다.
  await activateToken(deps.store, KIND, account.id, token, PASSWORD_RESET_TTL_SECONDS);
  return { message: '비밀번호 재설정 메일을 발송했습니다.' };
}

export async function verifyPasswordReset(token: string, store: KeyValueStore) {
  if (!(await readToken<ResetPayload>(store, KIND, token))) throw invalidLink();
  return { valid: true as const };
}

/** 토큰을 소비해 새 비밀번호를 저장하고, 그 계정의 기존 로그인을 모두 끊는다. */
export async function confirmPasswordReset(
  input: { token: string; password: string },
  store: KeyValueStore,
) {
  const taken = await takeToken<ResetPayload>(store, KIND, input.token);
  if (!taken) throw invalidLink();
  const { accountId } = taken.payload;
  try {
    const passwordHash = await hashPassword(input.password);
    // 계정 상태는 건드리지 않는다. 비활성 계정은 비밀번호를 바꿔도 로그인할 수 없다.
    await getPrismaClient().account.update({ where: { id: accountId }, data: { passwordHash } });
    await invalidateAccountSessions(store, accountId);
    await finishToken(store, KIND, accountId, taken);
  } catch (error) {
    await restoreToken(store, KIND, accountId, taken);
    throw error;
  }
}
