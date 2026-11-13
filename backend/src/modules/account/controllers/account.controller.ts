import type { RequestHandler } from 'express';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId, parseAccountQuery } from '../validations/account-query.validation.js';
import * as accountService from '../services/account-query.service.js';

export const list: RequestHandler = async (req, res) => {
  const result = await accountService.list(parseAccountQuery(req.query));
  sendData(res, result.data, 200, result.meta);
};

export const get: RequestHandler = async (req, res) => {
  sendData(res, await accountService.get(parseAccountId(req.params.accountId)));
};
