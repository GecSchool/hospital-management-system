import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../scripts/test-db-config.mjs';
import { createHospitalFixture } from '../helpers/fixtures.js';

const { Client } = pg;
let client: pg.Client;

const insertAppointment = `INSERT INTO appointments
  (id, patient_id, doctor_account_id, department_id, registered_by_account_id, starts_at)
  VALUES ($1, $2, $3, $4, $5, $6)`;

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
    await client.query('INSERT INTO doctor_availability VALUES ($1, 1, 540, 560)', [doctorId]);
    const args = [patientId, doctorId, departmentId, staffId, '2026-11-16T00:00:00Z'];
    await client.query(insertAppointment, ['appointment_1', ...args]);
    await client.query('SAVEPOINT duplicate_check');
    await expect(client.query(insertAppointment, ['appointment_2', ...args])).rejects.toMatchObject(
      { code: '23505' },
    );
    await client.query('ROLLBACK TO SAVEPOINT duplicate_check');
    await client.query(
      `UPDATE appointments SET status = 'CANCELLED', cancelled_at = now(),
      cancelled_by_account_id = $1 WHERE id = 'appointment_1'`,
      [staffId],
    );
    await expect(
      client.query(insertAppointment, ['appointment_2', ...args]),
    ).resolves.toBeDefined();
  });

  it('직접 SQL에서도 서울 기준 휴진일과 근무시간 밖의 예약을 거부한다', async () => {
    const { doctorId, departmentId, staffId, patientId } = await createHospitalFixture(client);
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query(
      'INSERT INTO doctor_availability VALUES ($1, 1, 1320, 1340), ($1, 2, 0, 20)',
      [doctorId],
    );
    await client.query("INSERT INTO doctor_leaves VALUES ($1, DATE '2026-11-17')", [doctorId]);
    const args = [patientId, doctorId, departmentId, staffId];
    const validStart = '2026-11-16T13:00:00Z'; // 월요일 22:00 KST
    await client.query(insertAppointment, ['valid_appointment', ...args, validStart]);

    const invalidStarts = [
      '2026-11-16T12:40:00Z', // 시작 전
      '2026-11-16T13:20:00Z', // 종료 시각
      '2026-11-16T13:00:01Z', // 20분 칸의 시작 시각이 아님
      '2026-11-16T15:00:00Z', // 화요일 00:00 KST. 근무시간에는 포함되지만 휴진일
    ];
    for (const startsAt of invalidStarts) {
      await client.query('SAVEPOINT invalid_schedule');
      await expect(
        client.query(insertAppointment, ['invalid_appointment', ...args, startsAt]),
      ).rejects.toMatchObject({ code: '23514', constraint: 'appointments_schedule_check' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_schedule');
      await client.query('RELEASE SAVEPOINT invalid_schedule');
    }

    await client.query('SAVEPOINT invalid_update');
    await expect(
      client.query("UPDATE appointments SET starts_at = $1 WHERE id = 'valid_appointment'", [
        invalidStarts[3],
      ]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'appointments_schedule_check' });
    await client.query('ROLLBACK TO SAVEPOINT invalid_update');

    const { rows } = await client.query(
      'SELECT id, starts_at FROM appointments WHERE doctor_account_id = $1',
      [doctorId],
    );
    expect(rows).toEqual([{ id: 'valid_appointment', starts_at: new Date(validStart) }]);
  });
});
