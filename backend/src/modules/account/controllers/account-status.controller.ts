import type { RequestHandler } from 'express';
import type { AccountContext } from '../../../common/middlewares/auth.js';
import { sendData } from '../../../common/responses/index.js';
import { parseAccountId } from '../validations/account-query.validation.js';
import { parseAccountStatus } from '../validations/account-status.validation.js';
import { changeAccountStatus } from '../services/account-status.service.js';

export const changeStatus: RequestHandler = async (req, res) => {
  const actor = res.locals.account as AccountContext;
  sendData(
    res,
    await changeAccountStatus(
      actor.id,
      parseAccountId(req.params.accountId),
      parseAccountStatus(req.body),
    ),
  );
};
