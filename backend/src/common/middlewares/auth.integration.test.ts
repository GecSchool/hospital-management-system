import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler, requestId } from '../errors/index.js';
import { requireAccount, requireRole, type AccountProvider } from './auth.js';

describe('인증 제공자 연결점', () => {
  it('인증 없음과 다른 역할을 거부하고 허용 역할은 통과시킨다', async () => {
    const makeApp = (provider: AccountProvider, role: 'STAFF' | 'ADMIN') => {
      const fixture = express();
      fixture.locals.accountProvider = provider;
      fixture.use(requestId);
      fixture.get('/', requireAccount, requireRole(role), (_req, res) => res.sendStatus(204));
      fixture.use(errorHandler);
      return fixture;
    };
    const activeStaff: AccountProvider = async () => ({ id: '1', role: 'STAFF', status: 'ACTIVE', departmentId: null });
    const inactiveDoctor: AccountProvider = async () => ({ id: '1', role: 'DOCTOR', status: 'INACTIVE', departmentId: 'd' });
    expect((await request(makeApp(async () => null, 'STAFF')).get('/')).status).toBe(401);
    expect((await request(makeApp(activeStaff, 'STAFF')).get('/')).status).toBe(204);
    expect((await request(makeApp(activeStaff, 'ADMIN')).get('/')).status).toBe(403);
    expect((await request(makeApp(inactiveDoctor, 'STAFF')).get('/')).body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});
