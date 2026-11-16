// 첫 관리자 계정을 만든다. 초대는 관리자만 보낼 수 있으므로 최초 한 명은 직접 만들어야 한다.
// 사용법: npm run admin:create --workspace backend -- <이메일> <이름>
// 비밀번호는 실행 중에 입력받는다. 자동화할 때는 ADMIN_PASSWORD 환경변수로 전달한다.
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { getPrismaClient } from '../src/config/prisma.js';
import { hashPassword } from '../src/modules/auth/services/password.js';
import {
  PASSWORD_RULE_MESSAGE,
  passwordRuleViolation,
} from '../src/modules/auth/validations/password-submission.validation.js';
import { parseEmail } from '../src/modules/auth/validations/session.validation.js';

/** 입력한 글자가 화면에 보이지 않게 비밀번호를 두 번 받아, 서로 같을 때만 반환한다. */
async function askPassword(): Promise<string> {
  // 입력 내용을 화면에 되비추지 않도록 출력을 버린다. 안내 문구는 직접 출력한다.
  const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
  const reader = createInterface({ input: process.stdin, output: silent, terminal: true });
  const lines = reader[Symbol.asyncIterator]();
  const ask = async (question: string) => {
    process.stdout.write(question);
    const line = await lines.next();
    process.stdout.write('\n');
    if (line.done) throw new Error('비밀번호 입력이 취소되었습니다.');
    return line.value;
  };
  try {
    const password = await ask('비밀번호: ');
    if (password !== (await ask('비밀번호 확인: ')))
      throw new Error('비밀번호가 일치하지 않습니다.');
    return password;
  } finally {
    reader.close();
  }
}

async function main() {
  const [emailInput, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();
  if (!emailInput || !name || name.length > 50)
    throw new Error('사용법: npm run admin:create --workspace backend -- <이메일> <이름>');
  const email = parseEmail(emailInput);
  const password = process.env.ADMIN_PASSWORD || (await askPassword());
  if (passwordRuleViolation(password)) throw new Error(PASSWORD_RULE_MESSAGE);
  const database = getPrismaClient();
  try {
    if (await database.account.findUnique({ where: { email }, select: { id: true } }))
      throw new Error('이미 등록된 이메일입니다.');
    const account = await database.account.create({
      data: { email, name, role: 'ADMIN', passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    console.log(`관리자 계정을 만들었습니다: ${email} (${account.id})`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
