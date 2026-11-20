import { randomBytes } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient, type RedisClientType } from 'redis';
import { AppError } from '../../common/errors/index.js';
import { createConsoleMailer, createSmtpMailer, type Mailer } from '../../common/mail/mailer.js';
import { createAccountProvider } from '../../common/middlewares/account-provider.js';
import type { AccountProvider } from '../../common/middlewares/auth.js';
import {
  MemoryKeyValueStore,
  RedisKeyValueStore,
  type KeyValueStore,
} from '../../common/stores/key-value-store.js';
import type { AuthConfig } from '../../config/auth.js';
import { getPrismaClient } from '../../config/prisma.js';
import { createSessionMiddleware } from '../../config/session.js';
import { createAuthLimiters, type AuthLimiters } from './middlewares/rate-limit.js';
import { createSessionAccountResolver, destroySession } from './services/session.service.js';

/** 인증 기능이 동작하는 데 필요한 외부 연결 묶음. 앱을 만들 때 한 번 조립해 넘긴다. */
export type AuthRuntime = {
  /** 요청의 쿠키를 읽어 req.session을 채운다. */
  sessionMiddleware: RequestHandler;
  /** 세션의 계정 ID로 현재 계정의 역할·상태·소속을 DB에서 읽는다. */
  accountProvider: AccountProvider;
  /** 초대·재설정 토큰과 세션 무효화 번호 보관소. */
  store: KeyValueStore;
  doctorListCache?: KeyValueStore;
  mailer: Mailer;
  limiters: AuthLimiters;
  /** 메일의 링크가 가리킬 프론트엔드 주소. */
  appBaseUrl: string;
};

export function buildAuthRuntime(parts: {
  sessionSecret: string;
  sessionStore?: session.Store;
  store: KeyValueStore;
  doctorListCache?: KeyValueStore;
  mailer: Mailer;
  appBaseUrl: string;
}): AuthRuntime {
  const provider = createAccountProvider(createSessionAccountResolver(parts.store), () =>
    getPrismaClient(),
  );
  return {
    sessionMiddleware: createSessionMiddleware({
      secret: parts.sessionSecret,
      store: parts.sessionStore,
    }),
    async accountProvider(req) {
      const account = await provider(req);
      // 삭제되었거나 비활성화된 계정의 세션은 남겨 두지 않는다. 다시 활성화돼도 새로 로그인해야 한다.
      if (req.session?.accountId && account?.status !== 'ACTIVE') await destroySession(req);
      return account;
    },
    store: parts.store,
    doctorListCache: parts.doctorListCache,
    mailer: parts.mailer,
    limiters: createAuthLimiters(),
    appBaseUrl: parts.appBaseUrl,
  };
}

/** 환경변수 설정에 따라 실제 연결을 만든다. 서버를 시작할 때 한 번 호출한다. */
export async function createAuthRuntime(config: AuthConfig): Promise<AuthRuntime> {
  const notes: string[] = [];
  let sessionSecret = config.sessionSecret;
  if (!sessionSecret) {
    sessionSecret = randomBytes(32).toString('hex');
    notes.push('SESSION_SECRET이 없어 임시 값을 사용합니다. 서버를 다시 켜면 로그인이 풀립니다.');
  }
  let redis: RedisClientType | undefined;
  if (config.redisUrl) {
    redis = createClient({ url: config.redisUrl });
    // 연결이 끊겨도 서버가 죽지 않게 한다. 주소에는 비밀번호가 들어갈 수 있어 기록하지 않는다.
    redis.on('error', () => console.error('Redis 연결 오류가 발생했습니다.'));
    await redis.connect();
  } else {
    notes.push(
      'REDIS_URL이 없어 세션과 초대·재설정 링크를 메모리에 보관합니다. 서버를 다시 켜면 사라집니다.',
    );
  }
  if (!config.smtp) notes.push('SMTP_HOST가 없어 메일을 보내지 않고 이 콘솔에 내용을 출력합니다.');
  for (const note of notes) console.warn(`[개발용 설정] ${note}`);
  const redisStore = redis && new RedisKeyValueStore(redis);
  return buildAuthRuntime({
    sessionSecret,
    sessionStore: redis && new RedisStore({ client: redis, prefix: 'hospital:session:' }),
    store: redisStore ?? new MemoryKeyValueStore(),
    doctorListCache: redisStore,
    mailer: config.smtp ? createSmtpMailer(config.smtp, config.mailFrom) : createConsoleMailer(),
    appBaseUrl: config.appBaseUrl,
  });
}

/** 컨트롤러가 인증용 연결을 꺼낼 때 사용한다. */
export function getAuthRuntime(req: Request): AuthRuntime {
  const runtime = req.app.locals.auth as AuthRuntime | undefined;
  if (!runtime) throw new AppError(503, 'SERVICE_UNAVAILABLE', '인증 기능이 연결되지 않았습니다.');
  return runtime;
}
