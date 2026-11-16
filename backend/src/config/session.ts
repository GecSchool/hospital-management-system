import type { RequestHandler } from 'express';
import session from 'express-session';
import { SESSION_COOKIE_NAME, SESSION_IDLE_MS } from '../modules/auth/auth-policy.js';

// 세션에 보관하는 값. 계정 ID만 기억하고 역할·상태는 요청마다 DB에서 다시 확인한다.
declare module 'express-session' {
  interface SessionData {
    accountId?: string;
    /** 로그인한 시각(ms). 최대 유지 시간을 계산한다. */
    loginAt?: number;
    /** 로그인 당시의 세션 무효화 번호. 비밀번호가 바뀌면 번호가 올라가 이전 세션이 끊긴다. */
    epoch?: number;
  }
}

export const sessionCookieOptions = {
  httpOnly: true, // 브라우저의 자바스크립트가 쿠키를 읽지 못한다.
  sameSite: 'lax', // 다른 사이트가 보낸 POST 요청에는 쿠키가 붙지 않는다.
  secure: 'auto', // HTTPS로 접속하면 Secure 속성이 붙는다.
  path: '/',
} as const;

export function createSessionMiddleware(options: {
  secret: string;
  /** 생략하면 프로세스 메모리에 보관한다. 개발·테스트 전용. */
  store?: session.Store;
}): RequestHandler {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: options.secret,
    store: options.store,
    resave: false,
    saveUninitialized: false, // 로그인하지 않은 방문자에게는 세션과 쿠키를 만들지 않는다.
    rolling: true, // 요청할 때마다 만료 시간을 다시 늘린다.
    cookie: { ...sessionCookieOptions, maxAge: SESSION_IDLE_MS },
  });
}
