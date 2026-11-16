// ACC-05 재설정 메일 요청, AUTH-06~07 재설정 링크 검증·비밀번호 변경.
import type { RequestHandler } from 'express';
import { sendData } from '../../../common/responses/index.js';
import { getAuthRuntime } from '../auth-runtime.js';
import * as passwordResetService from '../services/password-reset.service.js';
import {
  parseAccountId,
  parsePasswordSubmission,
  parseTokenBody,
} from '../validations/password-reset.validation.js';

export const request: RequestHandler = async (req, res) => {
  sendData(
    res,
    await passwordResetService.requestPasswordReset(
      parseAccountId(req.params.accountId),
      getAuthRuntime(req),
    ),
  );
};

export const verify: RequestHandler = async (req, res) => {
  const { store } = getAuthRuntime(req);
  sendData(res, await passwordResetService.verifyPasswordReset(parseTokenBody(req.body), store));
};

export const confirm: RequestHandler = async (req, res) => {
  const { store } = getAuthRuntime(req);
  await passwordResetService.confirmPasswordReset(parsePasswordSubmission(req.body), store);
  res.status(204).end();
};
