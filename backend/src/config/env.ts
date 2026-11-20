import 'dotenv/config';

export type AppConfig = { port: number; corsOrigin: string | undefined; trustProxyHops?: number };

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const portString = env.PORT ?? '3000';
  if (!/^[1-9]\d*$/.test(portString) || Number(portString) > 65535)
    throw new Error('PORT는 1~65535 정수여야 합니다.');
  const proxyHops = env.TRUST_PROXY_HOPS;
  if (proxyHops && !/^[1-9]\d*$/.test(proxyHops))
    throw new Error('TRUST_PROXY_HOPS는 양의 정수여야 합니다.');
  const corsOrigin = env.CORS_ORIGIN || undefined;
  if (corsOrigin) {
    let parsed: URL;
    try {
      parsed = new URL(corsOrigin);
    } catch {
      throw new Error('CORS_ORIGIN은 유효한 HTTP(S) 출처여야 합니다.');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== corsOrigin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error('CORS_ORIGIN에는 경로 없는 HTTP(S) 출처만 지정해야 합니다.');
    }
  }
  return {
    port: Number(portString),
    corsOrigin,
    ...(proxyHops ? { trustProxyHops: Number(proxyHops) } : {}),
  };
}

export const config = parseConfig(process.env);
