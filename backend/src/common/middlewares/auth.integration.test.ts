import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler, requestId } from '../errors/index.js';
import { requireAccount, requireRole } from './auth.js';

describe('인증 제공자 연결점', () => {
  it('인증 없음과 다른 역할을 거부하고 허용 역할은 통과시킨다', async () => {
    const fixture = express();
    fixture.use(requestId);
    fixture.get('/anonymous', requireAccount(async () => null), (_req, res) => res.sendStatus(200));
    fixture.get('/staff', requireAccount(async () => ({ id: '1', role: 'STAFF', status: 'ACTIVE', departmentId: null })), requireRole('STAFF'), (_req, res) => res.sendStatus(204));
    fixture.get('/admin', requireAccount(async () => ({ id: '1', role: 'STAFF', status: 'ACTIVE', departmentId: null })), requireRole('ADMIN'), (_req, res) => res.sendStatus(204));
    fixture.get('/inactive', requireAccount(async () => ({ id: '1', role: 'DOCTOR', status: 'INACTIVE', departmentId: 'd' })), (_req, res) => res.sendStatus(204));
    fixture.use(errorHandler);
    expect((await request(fixture).get('/anonymous')).status).toBe(401);
    expect((await request(fixture).get('/staff')).status).toBe(204);
    expect((await request(fixture).get('/admin')).status).toBe(403);
    expect((await request(fixture).get('/inactive')).body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});
