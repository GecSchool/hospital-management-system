import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';
import { AppError, errorHandler, requestId } from './common/errors/index.js';
import { config, type AppConfig } from './config/env.js';
import { systemRouter } from './modules/system/system.routes.js';
import { apiRouter } from './routes/index.js';
import type { AccountProvider } from './common/middlewares/auth.js';

type AppDependencies = { accountProvider?: AccountProvider };

export function createApp(settings: AppConfig, dependencies: AppDependencies = {}) {
  const app = express();
  // 실제 세션이 연결되기 전에는 인증 제공자가 없어 보호된 요청을 거부한다.
  app.locals.accountProvider = dependencies.accountProvider;
  app.disable('x-powered-by');
  app.use(requestId);
  // Swagger UI의 인라인 초기화 스크립트는 문서 경로에 한해 CSP를 적용하지 않는다.
  const docsSecurity = helmet({ contentSecurityPolicy: false });
  const apiSecurity = helmet();
  app.use((req, res, next) => (req.path === '/api-docs' || req.path.startsWith('/api-docs/') ? docsSecurity : apiSecurity)(req, res, next));
  if (settings.corsOrigin) app.use(cors({ origin: (origin, callback) => callback(null, origin === settings.corsOrigin), credentials: true }));
  app.use(express.json());

  // 명세 초안 제공은 업무 API의 구현 완료를 의미하지 않는다.
  const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
  app.get('/api-docs/openapi.yaml', (_req, res) => res.type('application/yaml').sendFile(openApiPath));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: '/api-docs/openapi.yaml' } }));
  app.use('/api', systemRouter);
  app.use('/api/v1', apiRouter);
  app.use('/api/v1', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.')));
  app.use(errorHandler);
  return app;
}

export const app = createApp(config);
