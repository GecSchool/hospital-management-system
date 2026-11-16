import type { RequestHandler } from 'express';
import { getAuthRuntime } from '../auth-runtime.js';

// 횟수 기록은 앱마다 따로 가지므로, 요청이 들어온 앱의 제한기를 찾아 실행한다.

/** 로그인 실패 횟수 제한. */
export const limitLogin: RequestHandler = (req, res, next) =>
  getAuthRuntime(req).limiters.login(req, res, next);

/** 링크 검증·수락처럼 로그인 없이 호출하는 API의 요청 수 제한. */
export const limitPublicToken: RequestHandler = (req, res, next) =>
  getAuthRuntime(req).limiters.publicToken(req, res, next);
