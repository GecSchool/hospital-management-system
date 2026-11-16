// ACC-03 초대 요청, AUTH-04~05 초대 링크 검증·수락.
import { Router } from 'express';
import { requireAccount, requireRole } from '../../../common/middlewares/auth.js';
import * as invitationController from '../controllers/invitation.controller.js';
import { limitPublicToken } from '../middlewares/apply-rate-limit.js';

/** /api/v1/account-invitations — 관리자만 초대를 보낼 수 있다. */
export const accountInvitationRouter = Router();
accountInvitationRouter.post(
  '/',
  requireAccount,
  requireRole('ADMIN'),
  invitationController.invite,
);

/** /api/v1/auth/invitations — 초대받은 사람이 로그인 없이 호출한다. 토큰이 본인 확인을 대신한다. */
export const invitationRouter = Router();
invitationRouter.post('/verify', limitPublicToken, invitationController.verify);
invitationRouter.post('/accept', limitPublicToken, invitationController.accept);
