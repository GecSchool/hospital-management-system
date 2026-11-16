import { describe, expect, it } from 'vitest';
import { parseAuthConfig } from './auth.js';

const production = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'a'.repeat(32),
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'https://hospital.example',
  SMTP_HOST: 'smtp.example',
  MAIL_FROM: 'no-reply@hospital.example',
};

describe('인증 설정', () => {
  it('개발 환경에서는 값이 없어도 대체 수단을 쓰도록 비워 둔다', () => {
    expect(parseAuthConfig({})).toEqual({
      sessionSecret: undefined,
      redisUrl: undefined,
      appBaseUrl: 'http://localhost:5173',
      smtp: undefined,
      mailFrom: 'no-reply@localhost',
    });
  });

  it('운영 환경에서는 필요한 값이 하나라도 빠지면 거부한다', () => {
    expect(parseAuthConfig(production)).toMatchObject({
      redisUrl: 'redis://localhost:6379',
      appBaseUrl: 'https://hospital.example',
      smtp: { host: 'smtp.example', port: 587, secure: false, user: undefined },
    });
    for (const key of Object.keys(production).filter((name) => name !== 'NODE_ENV'))
      expect(() => parseAuthConfig({ ...production, [key]: '' })).toThrow(key);
  });

  it('형식이 잘못된 값을 거부한다', () => {
    expect(() => parseAuthConfig({ SESSION_SECRET: 'short' })).toThrow();
    expect(() => parseAuthConfig({ REDIS_URL: 'http://localhost:6379' })).toThrow();
    expect(() => parseAuthConfig({ REDIS_URL: 'localhost' })).toThrow();
    expect(() => parseAuthConfig({ APP_BASE_URL: 'http://localhost:5173/app' })).toThrow();
    expect(() => parseAuthConfig({ SMTP_HOST: 'smtp.example', SMTP_PORT: '0' })).toThrow();
    expect(() => parseAuthConfig({ SMTP_HOST: 'smtp.example', SMTP_SECURE: 'yes' })).toThrow();
  });

  it('SMTP 포트에 맞춰 TLS 방식을 정하고 명시한 값을 우선한다', () => {
    const smtp = (env: NodeJS.ProcessEnv) =>
      parseAuthConfig({ SMTP_HOST: 'smtp.example', ...env }).smtp;
    expect(smtp({ SMTP_PORT: '465' })).toMatchObject({ port: 465, secure: true });
    expect(smtp({ SMTP_PORT: '465', SMTP_SECURE: 'false' })).toMatchObject({ secure: false });
    expect(smtp({ SMTP_USER: 'user', SMTP_PASSWORD: 'pass' })).toMatchObject({
      port: 587,
      secure: false,
      user: 'user',
      password: 'pass',
    });
  });
});
