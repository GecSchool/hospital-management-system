import { randomUUID } from 'node:crypto';
import type pg from 'pg';

// 호출자가 트랜잭션을 시작하고 롤백한다. 주민등록번호가 아닌 가상 바이트만 사용한다.
export async function createHospitalFixture(client: pg.Client) {
  const id = randomUUID();
  const departmentId = `dep_${id}`;
  const doctorId = `doctor_${id}`;
  const nurseId = `nurse_${id}`;
  const staffId = `staff_${id}`;
  const patientId = `patient_${id}`;
  await client.query('INSERT INTO departments (id, name) VALUES ($1, $2)', [departmentId, `test_${id}`]);
  await client.query(`INSERT INTO accounts (id, email, password_hash, name, role)
    VALUES ($1, $2, 'test-only', 'test', 'DOCTOR'),
           ($3, $4, 'test-only', 'test', 'NURSE'),
           ($5, $6, 'test-only', 'test', 'STAFF')`,
  [doctorId, `${doctorId}@example.test`, nurseId, `${nurseId}@example.test`, staffId, `${staffId}@example.test`]);
  await client.query('INSERT INTO doctors (account_id, department_id) VALUES ($1, $2)', [doctorId, departmentId]);
  await client.query('INSERT INTO nurses (account_id, department_id) VALUES ($1, $2)', [nurseId, departmentId]);
  await client.query(`INSERT INTO patients
    (id, patient_number, name, resident_number_ciphertext, resident_number_lookup, birth_date, phone)
    VALUES ($1, $2, 'test', $3, $4, '2000-01-01', '010-0000-0000')`,
  [patientId, `test_${id}`, Buffer.from('synthetic'), Buffer.from(id.replaceAll('-', ''), 'utf8')]);
  return { departmentId, doctorId, nurseId, staffId, patientId };
}
