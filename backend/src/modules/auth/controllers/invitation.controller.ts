// ACC-03 초대 요청, AUTH-04~05 초대 링크 검증·수락.
import type { RequestHandler } from 'express';
import { sendData } from '../../../common/responses/index.js';
import { getAuthRuntime } from '../auth-runtime.js';
import * as invitationService from '../services/invitation.service.js';
import { parseInvitationRequest } from '../validations/invitation.validation.js';
import {
  parsePasswordSubmission,
  parseTokenBody,
} from '../validations/password-submission.validation.js';

export const invite: RequestHandler = async (req, res) => {
  sendData(
    res,
    await invitationService.requestInvitation(
      parseInvitationRequest(req.body),
      getAuthRuntime(req),
    ),
  );
};

export const verify: RequestHandler = async (req, res) => {
  const { store } = getAuthRuntime(req);
  sendData(res, await invitationService.verifyInvitation(parseTokenBody(req.body), store));
};

export const accept: RequestHandler = async (req, res) => {
  const { store } = getAuthRuntime(req);
  const created = await invitationService.acceptInvitation(
    parsePasswordSubmission(req.body),
    store,
  );
  sendData(res, created, 201);
};
