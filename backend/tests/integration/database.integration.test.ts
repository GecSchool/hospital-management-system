import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';
import { createHospitalFixture } from '../helpers/fixtures.js';

const { Client } = pg;
let client: pg.Client;

describe('초기 마이그레이션', () => {
  beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  it('테스트 DB에 수동 제약과 예약 부분 유일 인덱스가 적용되어 있다', async () => {
    const { rows } = await client.query(`
      SELECT conname AS name FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      UNION ALL
      SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'
    `);
    const names = rows.map((row) => row.name);
    expect(names).toContain('doctor_availability_no_overlap');
    expect(names).toContain('doctor_availability_minutes_check');
    expect(names).toContain('appointments_booked_doctor_time_key');
    expect(names).toContain('patients_resident_number_lookup_key');
  });

  it('같은 의사와 시각의 유효 예약은 중복되지 않고 취소 후에는 다시 예약할 수 있다', async () => {
    const { doctorId, departmentId, staffId, patientId } = await createHospitalFixture(client);
    const insert = `INSERT INTO appointments
      (id, patient_id, doctor_account_id, department_id, registered_by_account_id, starts_at)
      VALUES ($1, $2, $3, $4, $5, '2026-11-16T00:00:00Z')`;
    const args = [patientId, doctorId, departmentId, staffId];
    await client.query(insert, ['appointment_1', ...args]);
    await client.query('SAVEPOINT duplicate_check');
    await expect(client.query(insert, ['appointment_2', ...args])).rejects.toMatchObject({
      code: '23505',
    });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_check');
    await client.query(
      `UPDATE appointments SET status = 'CANCELLED', cancelled_at = now(),
      cancelled_by_account_id = $1 WHERE id = 'appointment_1'`,
      [staffId],
    );
    await expect(client.query(insert, ['appointment_2', ...args])).resolves.toBeDefined();
  });
});
