import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';
import { AppError, errorHandler, requestId } from './common/errors/index.js';
import { config, type AppConfig } from './config/env.js';
import { systemRouter } from './modules/system/routes/system.routes.js';
import { apiRouter } from './routes/index.js';
import type { AccountProvider } from './common/middlewares/auth.js';
import type { AuthRuntime } from './modules/auth/auth-runtime.js';

type AppDependencies = {
  /** 테스트에서 로그인 과정 없이 특정 계정으로 요청할 때 지정한다. */
  accountProvider?: AccountProvider;
  /** 세션·토큰 저장소·메일 발송 묶음. 없으면 로그인할 수 없어 보호된 요청이 모두 거부된다. */
  auth?: AuthRuntime;
};

export function createApp(settings: AppConfig, dependencies: AppDependencies = {}) {
  const app = express();
  if (settings.trustProxyHops) app.set('trust proxy', settings.trustProxyHops);
  // 인증 묶음이 없으면 계정 제공자도 없어 보호된 요청을 거부한다.
  app.locals.auth = dependencies.auth;
  app.locals.accountProvider = dependencies.accountProvider ?? dependencies.auth?.accountProvider;
  app.disable('x-powered-by');
  app.use(requestId);
  // Swagger UI의 인라인 초기화 스크립트는 문서 경로에 한해 CSP를 적용하지 않는다.
  const docsSecurity = helmet({ contentSecurityPolicy: false });
  const apiSecurity = helmet();
  app.use((req, res, next) =>
    (req.path === '/api-docs' || req.path.startsWith('/api-docs/') ? docsSecurity : apiSecurity)(
      req,
      res,
      next,
    ),
  );
  if (settings.corsOrigin)
    app.use(
      cors({
        origin: (origin, callback) => callback(null, origin === settings.corsOrigin),
        credentials: true,
      }),
    );
  app.use(express.json());

  // 명세 초안 제공은 업무 API의 구현 완료를 의미하지 않는다.
  const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
  app.get('/api-docs/openapi.yaml', (_req, res) =>
    res.type('application/yaml').sendFile(openApiPath),
  );
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, { swaggerOptions: { url: '/api-docs/openapi.yaml' } }),
  );
  app.use('/api', systemRouter);
  // 세션 쿠키는 업무 API에서만 읽는다. 쿠키가 있으면 req.session에 로그인 정보가 채워진다.
  if (dependencies.auth) app.use('/api/v1', dependencies.auth.sessionMiddleware);
  app.use('/api/v1', apiRouter);
  app.use('/api/v1', (_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.')),
  );
  app.use(errorHandler);
  return app;
}

// 인증을 연결하지 않은 기본 앱. 실제 서버는 server.ts에서 인증 묶음을 연결해 새로 만든다.
export const app = createApp(config);
