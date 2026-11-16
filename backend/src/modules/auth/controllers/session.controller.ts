// AUTH-01~03 로그인·로그아웃·내 계정.
import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import * as accountService from '../../account/services/account-query.service.js';
import { getAuthRuntime } from '../auth-runtime.js';
import * as sessionService from '../services/session.service.js';
import { parseLoginBody } from '../validations/session.validation.js';

export const login: RequestHandler = async (req, res) => {
  const { store } = getAuthRuntime(req);
  const { email, password } = parseLoginBody(req.body);
  const account = await sessionService.authenticate(email, password);
  await sessionService.startSession(req, account.id, store);
  sendData(res, account);
};

export const logout: RequestHandler = async (req, res) => {
  await sessionService.endSession(req, res);
  res.status(204).end();
};

export const me: RequestHandler = async (_req, res) => {
  const account = res.locals.account as AccountContext;
  sendData(res, await accountService.get(account.id));
};
