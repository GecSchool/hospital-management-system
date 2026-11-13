import type { Request, RequestHandler } from 'express';
import { AppError } from '../errors/index.js';

export type AccountContext = { id: string; role: 'STAFF' | 'DOCTOR' | 'NURSE' | 'ADMIN'; status: 'ACTIVE' | 'INACTIVE'; departmentId: string | null };
// 제공자는 매 요청에서 최신 DB 계정·상태·소속을 확인해야 한다. 세션 구현은 팀원 작업과 연결한다.
export type AccountProvider = (req: Request) => Promise<AccountContext | null>;

export const requireAccount: RequestHandler = async (req, res, next) => {
  try {
    const provider = req.app.locals.accountProvider as AccountProvider | undefined;
    const account = provider ? await provider(req) : null;
    if (!account) throw new AppError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
    if (account.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_INACTIVE', '비활성 계정입니다.');
    res.locals.account = account;
    next();
  } catch (error) { next(error); }
};

export function requireRole(...roles: AccountContext['role'][]): RequestHandler {
  return (_req, res, next) => {
    const account = res.locals.account as AccountContext | undefined;
    if (!account) return next(new AppError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.'));
    if (!roles.includes(account.role)) return next(new AppError(403, 'FORBIDDEN', '접근 권한이 없습니다.'));
    next();
  };
}
