import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AppError } from '../../../common/errors/index.js';
import { validateDate } from '../../../common/utils/time.js';

export function parseResidentNumber(value: unknown) {
  if (typeof value !== 'string' || !/^\d{6}-?\d{7}$/.test(value))
    throw new AppError(400, 'VALIDATION_ERROR', '주민등록번호 형식이 올바르지 않습니다.');
  const normalized = value.replace('-', '');
  const centuryByCode: Record<string, string> = {
    '1': '19',
    '2': '19',
    '3': '20',
    '4': '20',
    '5': '19',
    '6': '19',
    '7': '20',
    '8': '20',
    '9': '18',
    '0': '18',
  };
  const birthDate = validateDate(
    `${centuryByCode[normalized[6]]}${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 6)}`,
  );
  return { normalized, birthDate };
}

// 버전(1바이트) | IV(12바이트) | 인증 태그(16바이트) | 암호문
export function createResidentNumberProtector(encryptionKey: Buffer, hmacKey: Buffer) {
  if (
    encryptionKey.length !== 32 ||
    hmacKey.length !== 32 ||
    timingSafeEqual(encryptionKey, hmacKey)
  )
    throw new Error('서로 다른 32바이트 주민등록번호 암호화 키와 조회 키가 필요합니다.');
  const encrypt = (normalized: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  };
  const decrypt = (value: Uint8Array) => {
    const bytes = Buffer.from(value);
    if (bytes.length !== 42 || bytes[0] !== 1) throw new Error('지원하지 않는 암호문 형식입니다.');
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(1, 13));
    cipher.setAuthTag(bytes.subarray(13, 29));
    return Buffer.concat([cipher.update(bytes.subarray(29)), cipher.final()]).toString('utf8');
  };
  const lookup = (normalized: string) =>
    createHmac('sha256', hmacKey).update(normalized, 'utf8').digest();
  return { encrypt, decrypt, lookup };
}

export function loadResidentNumberProtector(env: NodeJS.ProcessEnv = process.env) {
  function readKey(name: string) {
    const value = env[name];
    if (!value || !/^[0-9a-fA-F]{64}$/.test(value))
      throw new Error(`${name}은 32바이트 16진수 키여야 합니다.`);
    return Buffer.from(value, 'hex');
  }
  return createResidentNumberProtector(
    readKey('RESIDENT_ENCRYPTION_KEY'),
    readKey('RESIDENT_LOOKUP_KEY'),
  );
}
