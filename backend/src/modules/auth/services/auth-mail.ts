// 초대·비밀번호 재설정 메일의 내용과 발송.
import { AppError } from '../../../common/errors/index.js';
import type { Mailer } from '../../../common/mail/mailer.js';
import type { Role } from '../../../generated/prisma/client.js';
import { INVITATION_TTL_SECONDS, PASSWORD_RESET_TTL_SECONDS } from '../auth-policy.js';

const SERVICE_NAME = '병원 진료 예약 및 환자 관리 시스템';
const roleLabels: Record<Role, string> = {
  STAFF: '병원 직원',
  DOCTOR: '의사',
  NURSE: '간호사',
  ADMIN: '관리자',
};

// 토큰은 주소의 # 뒤에 둔다. 이 부분은 브라우저가 서버로 보내지 않아 접속 기록에 남지 않는다.
const link = (appBaseUrl: string, path: string, token: string) =>
  `${appBaseUrl}${path}#token=${token}`;

async function send(mailer: Mailer, message: { to: string; subject: string; text: string }) {
  try {
    await mailer.send(message);
  } catch {
    // 발송 실패 원인에는 서버 주소·계정 정보가 섞일 수 있어 응답에 담지 않는다.
    throw new AppError(
      503,
      'MAIL_SEND_FAILED',
      '메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
}

export function sendInvitationMail(
  mailer: Mailer,
  appBaseUrl: string,
  invitation: { name: string; email: string; role: Role },
  token: string,
) {
  return send(mailer, {
    to: invitation.email,
    subject: `[${SERVICE_NAME}] 계정 초대 안내`,
    text: [
      `${invitation.name}님, 안녕하세요.`,
      `${SERVICE_NAME}의 ${roleLabels[invitation.role]} 계정으로 초대되었습니다.`,
      '아래 링크에서 비밀번호를 설정하면 가입이 완료됩니다.',
      '',
      link(appBaseUrl, '/invitations/accept', token),
      '',
      `이 링크는 ${INVITATION_TTL_SECONDS / 3600}시간 동안 한 번만 사용할 수 있습니다.`,
      '초대를 요청한 적이 없다면 이 메일을 무시해 주세요.',
    ].join('\n'),
  });
}

export function sendPasswordResetMail(
  mailer: Mailer,
  appBaseUrl: string,
  account: { name: string; email: string },
  token: string,
) {
  return send(mailer, {
    to: account.email,
    subject: `[${SERVICE_NAME}] 비밀번호 재설정 안내`,
    text: [
      `${account.name}님, 안녕하세요.`,
      '관리자가 비밀번호 재설정을 요청했습니다. 아래 링크에서 새 비밀번호를 설정해 주세요.',
      '',
      link(appBaseUrl, '/password-reset', token),
      '',
      `이 링크는 ${PASSWORD_RESET_TTL_SECONDS / 60}분 동안 한 번만 사용할 수 있습니다.`,
      '요청한 적이 없다면 이 메일을 무시하고 관리자에게 알려 주세요.',
    ].join('\n'),
  });
}
