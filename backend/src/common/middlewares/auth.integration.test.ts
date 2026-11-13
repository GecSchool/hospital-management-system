import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler, requestId } from '../errors/index.js';
import { requireAccount, requireRole, type AccountProvider } from './auth.js';

function createTestApp(provider: AccountProvider, role: 'STAFF' | 'ADMIN') {
  const fixture = express();
  fixture.locals.accountProvider = provider;
  fixture.use(requestId);
  fixture.get('/', requireAccount, requireRole(role), (_req, res) => res.sendStatus(204));
  fixture.use(errorHandler);
  return fixture;
}

const activeStaff: AccountProvider = async () => ({
  id: '1',
  role: 'STAFF',
  status: 'ACTIVE',
  departmentId: null,
});

describe('인증 제공자 연결점', () => {
  it('인증 정보가 없으면 401을 반환한다', async () => {
    const response = await request(createTestApp(async () => null, 'STAFF')).get('/');
    expect(response.status).toBe(401);
  });

  it('허용된 역할의 활성 계정은 통과한다', async () => {
    const response = await request(createTestApp(activeStaff, 'STAFF')).get('/');
    expect(response.status).toBe(204);
  });

  it('다른 역할의 계정은 403을 반환한다', async () => {
    const response = await request(createTestApp(activeStaff, 'ADMIN')).get('/');
    expect(response.status).toBe(403);
  });

  it('비활성 계정은 ACCOUNT_INACTIVE를 반환한다', async () => {
    const inactiveDoctor: AccountProvider = async () => ({
      id: '1',
      role: 'DOCTOR',
      status: 'INACTIVE',
      departmentId: 'd',
    });
    const response = await request(createTestApp(inactiveDoctor, 'STAFF')).get('/');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});
