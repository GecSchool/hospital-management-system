import argon2 from 'argon2';

/** 비밀번호 원문은 저장하지 않고, 되돌릴 수 없는 argon2id 해시만 저장한다. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // 형식이 올바르지 않은 해시는 어떤 비밀번호와도 일치하지 않는 것으로 본다.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * 없는 이메일로 로그인할 때도 같은 양의 해시 계산을 수행한다.
 * 응답 시간 차이로 이메일 존재 여부를 추측하지 못하게 하기 위함이다.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(await dummyHash, password);
}
