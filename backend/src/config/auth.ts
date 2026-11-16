import type { SmtpSettings } from '../common/mail/mailer.js';

export type AuthConfig = {
  /** 세션 쿠키 서명용 비밀값. 개발 환경에서 비어 있으면 서버가 임시 값을 만든다. */
  sessionSecret: string | undefined;
  /** 세션·초대·재설정 토큰 저장소. 개발 환경에서 비어 있으면 메모리에 보관한다. */
  redisUrl: string | undefined;
  /** 메일의 링크가 가리킬 프론트엔드 주소. */
  appBaseUrl: string;
  /** 개발 환경에서 비어 있으면 메일을 보내지 않고 콘솔에 출력한다. */
  smtp: SmtpSettings | undefined;
  mailFrom: string;
};

function origin(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name}은 유효한 HTTP(S) 주소여야 합니다.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value)
    throw new Error(`${name}에는 경로 없는 HTTP(S) 주소만 지정해야 합니다.`);
  return value;
}

function smtpSettings(env: NodeJS.ProcessEnv): SmtpSettings | undefined {
  const host = env.SMTP_HOST || undefined;
  if (!host) return undefined;
  const portString = env.SMTP_PORT ?? '587';
  if (!/^[1-9]\d*$/.test(portString) || Number(portString) > 65535)
    throw new Error('SMTP_PORT는 1~65535 정수여야 합니다.');
  const port = Number(portString);
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE))
    throw new Error('SMTP_SECURE는 true 또는 false여야 합니다.');
  return {
    host,
    port,
    // 465 포트는 처음부터 TLS로 연결하고, 그 밖의 포트는 STARTTLS로 올린다.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
  };
}

/** 운영 환경에서는 필요한 값이 빠지면 서버를 시작하지 않는다. 개발 환경에서는 대체 수단을 쓴다. */
export function parseAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const isProduction = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET || undefined;
  if (sessionSecret && sessionSecret.length < 32)
    throw new Error('SESSION_SECRET은 32자 이상의 무작위 문자열이어야 합니다.');
  const redisUrl = env.REDIS_URL || undefined;
  if (redisUrl) {
    let protocol: string;
    try {
      protocol = new URL(redisUrl).protocol;
    } catch {
      throw new Error('REDIS_URL은 redis:// 또는 rediss:// 주소여야 합니다.');
    }
    if (!['redis:', 'rediss:'].includes(protocol))
      throw new Error('REDIS_URL은 redis:// 또는 rediss:// 주소여야 합니다.');
  }
  const smtp = smtpSettings(env);
  const mailFrom = env.MAIL_FROM || 'no-reply@localhost';
  if (isProduction) {
    const missing = [
      !sessionSecret && 'SESSION_SECRET',
      !redisUrl && 'REDIS_URL',
      !env.APP_BASE_URL && 'APP_BASE_URL',
      !smtp && 'SMTP_HOST',
      !env.MAIL_FROM && 'MAIL_FROM',
    ].filter(Boolean);
    if (missing.length)
      throw new Error(`운영 환경에는 다음 환경변수가 필요합니다: ${missing.join(', ')}`);
  }
  return {
    sessionSecret,
    redisUrl,
    appBaseUrl: origin(env.APP_BASE_URL || 'http://localhost:5173', 'APP_BASE_URL'),
    smtp,
    mailFrom,
  };
}
