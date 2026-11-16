// 로컬 개발·시연용 가상 계정과 진료과를 만든다. 이미 있는 이메일·진료과는 건드리지 않는다.
// 사용법: npm run db:seed:dev --workspace backend
// 비밀번호는 SEED_PASSWORD 환경변수로 바꿀 수 있다. 운영 환경에서는 실행되지 않는다.
import 'dotenv/config';
import { getPrismaClient } from '../src/config/prisma.js';
import { hashPassword } from '../src/modules/auth/services/password.js';
import {
  PASSWORD_RULE_MESSAGE,
  passwordRuleViolation,
} from '../src/modules/auth/validations/password-submission.validation.js';

const password = process.env.SEED_PASSWORD || 'hospital1234!';
const accounts = [
  { email: 'admin@example.test', name: '김관리', role: 'ADMIN' },
  { email: 'staff@example.test', name: '이직원', role: 'STAFF' },
  { email: 'doctor@example.test', name: '박의사', role: 'DOCTOR' },
  { email: 'nurse@example.test', name: '최간호', role: 'NURSE' },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('운영 환경에서는 개발용 데이터를 만들 수 없습니다.');
  if (passwordRuleViolation(password)) throw new Error(`SEED_PASSWORD: ${PASSWORD_RULE_MESSAGE}`);
  const database = getPrismaClient();
  try {
    const departments = [];
    for (const name of ['내과', '정형외과'])
      departments.push(
        await database.department.upsert({ where: { name }, update: {}, create: { name } }),
      );
    const departmentId = departments[0].id;
    const passwordHash = await hashPassword(password);
    let created = 0;
    for (const account of accounts) {
      if (await database.account.findUnique({ where: { email: account.email } })) {
        console.log(`건너뜀(이미 있음): ${account.email}`);
        continue;
      }
      await database.account.create({
        data: {
          ...account,
          passwordHash,
          ...(account.role === 'DOCTOR' && { doctor: { create: { departmentId } } }),
          ...(account.role === 'NURSE' && { nurse: { create: { departmentId } } }),
        },
      });
      created += 1;
      console.log(`생성: ${account.email} (${account.role})`);
    }
    if (created) console.log(`새로 만든 계정의 비밀번호: ${password}`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
