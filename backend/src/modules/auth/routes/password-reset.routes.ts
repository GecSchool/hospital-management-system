// ACC-05 재설정 메일 요청, AUTH-06~07 재설정 링크 검증·비밀번호 변경.
import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as passwordResetController from '../controllers/password-reset.controller.js';
import { limitPublicToken } from '../middlewares/apply-rate-limit.js';

/** /api/v1/accounts — 관리자만 재설정 메일을 보낼 수 있다. */
export const accountPasswordResetRouter = Router();
accountPasswordResetRouter.post(
  '/:accountId/password-reset',
  requireAccount,
  requireRole('ADMIN'),
  passwordResetController.request,
);

/** /api/v1/auth/password-resets — 메일을 받은 사람이 로그인 없이 호출한다. */
export const passwordResetRouter = Router();
passwordResetRouter.post('/verify', limitPublicToken, passwordResetController.verify);
passwordResetRouter.post('/confirm', limitPublicToken, passwordResetController.confirm);
