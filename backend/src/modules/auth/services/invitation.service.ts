// ACC-03 초대 요청, AUTH-04 초대 링크 검증, AUTH-05 초대 수락·가입.
import { AppError } from '../../../common/errors/index.js';
import type { Mailer } from '../../../common/mail/mailer.js';
import type { KeyValueStore } from '../../../common/stores/key-value-store.js';
import { getPrismaClient } from '../../../config/prisma.js';
import { INVITATION_TTL_SECONDS } from '../auth-policy.js';
import type { InvitationRequest } from '../validations/invitation.validation.js';
import { sendInvitationMail } from './auth-mail.js';
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

const KIND = 'invitation';
const departmentSelect = { id: true, name: true, status: true } as const;

const invalidLink = () =>
  new AppError(410, 'INVITATION_INVALID', '초대 링크가 만료되었거나 이미 사용되었습니다.');
const duplicateEmail = () =>
  new AppError(409, 'ACCOUNT_EMAIL_DUPLICATE', '이미 등록된 이메일입니다.');

/** 초대 정보를 임시 저장소에 두고 가입 링크를 메일로 보낸다. 수락 전에는 계정을 만들지 않는다. */
export async function requestInvitation(
  input: InvitationRequest,
  deps: { store: KeyValueStore; mailer: Mailer; appBaseUrl: string },
) {
  const database = getPrismaClient();
  if (await database.account.findUnique({ where: { email: input.email }, select: { id: true } }))
    throw duplicateEmail();
  if (input.departmentId) {
    const department = await database.department.findUnique({
      where: { id: input.departmentId },
      select: departmentSelect,
    });
    if (!department) throw new AppError(404, 'NOT_FOUND', '진료과를 찾을 수 없습니다.');
    if (department.status !== 'ACTIVE')
      throw new AppError(409, 'CONFLICT', '비활성 진료과에는 초대할 수 없습니다.');
  }
  const token = await issueToken(deps.store, KIND, input, INVITATION_TTL_SECONDS);
  try {
    await sendInvitationMail(deps.mailer, deps.appBaseUrl, input, token);
  } catch (error) {
    // 메일이 나가지 않았으면 방금 만든 토큰만 지운다. 이전에 보낸 초대 링크는 그대로 유효하다.
    await discardToken(deps.store, KIND, token);
    throw error;
  }
  // 같은 이메일의 이전 초대 링크는 이 시점부터 사용할 수 없다.
  await activateToken(deps.store, KIND, input.email, token, INVITATION_TTL_SECONDS);
  return { message: '초대 메일을 발송했습니다.' };
}

/** 가입 화면에 보여 줄 초대 정보를 반환한다. 토큰은 소비하지 않는다. */
export async function verifyInvitation(token: string, store: KeyValueStore) {
  const invitation = await readToken<InvitationRequest>(store, KIND, token);
  if (!invitation) throw invalidLink();
  let department = null;
  if (invitation.departmentId) {
    department = await getPrismaClient().department.findUnique({
      where: { id: invitation.departmentId },
      select: departmentSelect,
    });
    // 초대 후 진료과가 삭제되었다면 가입을 끝낼 수 없으므로 링크를 쓸 수 없다고 알린다.
    if (!department) throw invalidLink();
  }
  return { name: invitation.name, email: invitation.email, role: invitation.role, department };
}

/** 초대 토큰을 소비해 계정을 만든다. 실패하면 토큰을 되돌려 다시 시도할 수 있게 한다. */
export async function acceptInvitation(
  input: { token: string; password: string },
  store: KeyValueStore,
) {
  const taken = await takeToken<InvitationRequest>(store, KIND, input.token);
  if (!taken) throw invalidLink();
  const invitation = taken.payload;
  try {
    const passwordHash = await hashPassword(input.password);
    const account = await getPrismaClient().$transaction(async (tx) => {
      const { departmentId } = invitation;
      if (departmentId) {
        // 진료과 비활성화·삭제와 동시에 실행돼도 비활성 과에 의료진이 생기지 않도록 행을 잠근다.
        await tx.$queryRaw`SELECT id FROM "departments" WHERE id = ${departmentId} FOR UPDATE`;
        const department = await tx.department.findUnique({
          where: { id: departmentId },
          select: { status: true },
        });
        if (department?.status !== 'ACTIVE')
          throw new AppError(
            409,
            'CONFLICT',
            '초대받은 진료과를 사용할 수 없습니다. 관리자에게 문의해 주세요.',
          );
      }
      if (await tx.account.findUnique({ where: { email: invitation.email }, select: { id: true } }))
        throw duplicateEmail();
      return tx.account.create({
        data: {
          name: invitation.name,
          email: invitation.email,
          role: invitation.role,
          passwordHash,
          ...(invitation.role === 'DOCTOR' &&
            departmentId && { doctor: { create: { departmentId } } }),
          ...(invitation.role === 'NURSE' &&
            departmentId && { nurse: { create: { departmentId } } }),
        },
        select: { id: true },
      });
    });
    await finishToken(store, KIND, invitation.email, taken);
    return { accountId: account.id };
  } catch (error) {
    // 두 요청이 동시에 같은 이메일로 가입하면 DB의 유일 제약(P2002)이 한쪽을 막는다.
    const duplicated =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
    const handled = duplicated ? duplicateEmail() : error;
    // 이미 가입된 이메일의 초대는 더 쓸 일이 없으므로 되돌리지 않는다.
    if (!(handled instanceof AppError && handled.code === 'ACCOUNT_EMAIL_DUPLICATE'))
      await restoreToken(store, KIND, invitation.email, taken);
    throw handled;
  }
}
