// AUTH-01~03 로그인·로그아웃·내 계정. /api/v1/auth 아래에 연결한다.
import { Router } from 'express';
import { requireAccount } from '../../../common/middlewares/auth.js';
import * as sessionController from '../controllers/session.controller.js';
import { limitLogin } from '../middlewares/apply-rate-limit.js';

export const sessionRouter = Router();
sessionRouter.post('/login', limitLogin, sessionController.login);
// 세션이 이미 만료되었더라도 204로 응답한다. 로그아웃은 몇 번 호출해도 결과가 같다.
sessionRouter.post('/logout', sessionController.logout);
sessionRouter.get('/me', requireAccount, sessionController.me);
